"""Workspace orchestration logic using the Pulumi Automation API."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, Iterable, List, Optional

import pulumi
from pulumi import automation as auto

from ..config import AppConfig
from ..events.models import EventType, PermitEvent, PermitStatus
from ..events.publisher import AuditEventPublisher, RabbitMQPublisher
from ..services.state_manager import WorkspaceLifecycleStatus, WorkspaceStateManager
from .pulumi_programs.network import CIDRRule, NetworkPolicyProfile, build_network_policy
from .pulumi_programs.storage import VolumeSpec, provision_pvcs
from .pulumi_programs.workspace import (
    WorkspaceContainer,
    WorkspaceSpec,
    WorkspaceUser,
    build_workspace_deployment,
    create_secret,
)

LOGGER = logging.getLogger(__name__)


class WorkspaceType(str, Enum):
    """Logical workspace stages managed by the orchestrator."""

    INGRESS = "ingress"
    PREPROCESS = "preprocess"
    REVIEW = "review"
    SETUP = "setup"
    SETUP_REVIEW = "setup-review"
    ANALYSIS = "analysis"


@dataclass
class NetworkConfig:
    """Container for network policy configuration."""

    profile: NetworkPolicyProfile
    ingress: List[CIDRRule] = field(default_factory=list)
    egress: List[CIDRRule] = field(default_factory=list)
    proxy_selector: Optional[dict] = None


@dataclass
class WorkspacePlan:
    """Complete plan for provisioning or updating a workspace."""

    stack_name: str
    workspace_spec: WorkspaceSpec
    network: NetworkConfig
    connection_secret: Optional[Dict[str, str]] = None
    connection_info: Optional[Dict[str, Any]] = None
    exports: Dict[str, Any] = field(default_factory=dict)
    refresh: bool = True


@dataclass(frozen=True)
class VolumeTemplate:
    """Declarative template describing a workspace volume."""

    name: str
    mount_path: str
    read_only: bool
    access_modes: List[str]
    default_size: str
    size_key: Optional[str] = None
    storage_class: str = "spe-ceph-rbd"
    storage_class_key: Optional[str] = None

    def build(self, payload: Dict[str, Any]) -> VolumeSpec:
        size = (
            payload.get(self.size_key, self.default_size)
            if self.size_key
            else self.default_size
        )
        storage_class = (
            payload.get(self.storage_class_key, self.storage_class)
            if self.storage_class_key
            else self.storage_class
        )
        return VolumeSpec(
            name=self.name,
            storage_class=storage_class,
            size=size,
            access_modes=self.access_modes,
            read_only=self.read_only,
            mount_path=self.mount_path,
        )


@dataclass(frozen=True)
class WorkspaceConfigEntry:
    """Declarative defaults for each workspace type."""

    image: str
    network_profile: NetworkPolicyProfile
    default_env: Dict[str, str] = field(default_factory=dict)
    require_user: bool = True
    volume_templates: Optional[Iterable[VolumeTemplate]] = None
    volume_factory: Optional[Callable[[Dict[str, Any]], Iterable[VolumeSpec]]] = None
    network_factory: Optional[
        Callable[[Dict[str, Any], NetworkPolicyProfile], NetworkConfig]
    ] = None
    connection_secret_factory: Optional[
        Callable[[PermitEvent, WorkspaceSpec, Dict[str, Any]], Optional[Dict[str, str]]]
    ] = None
    connection_info_factory: Optional[
        Callable[[WorkspaceSpec, Dict[str, Any], Optional[Dict[str, str]]], Dict[str, Any]]
    ] = None


DEFAULT_PROXY_SELECTOR = {
    "namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": "infra"}},
    "podSelector": {"matchLabels": {"app": "spe-proxy"}},
}


def _ingress_volume_factory(payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
    data_holders = payload.get("data_holders", [])
    if not data_holders:
        return [
            VolumeSpec(
                name="uploads",
                storage_class=payload.get("uploads_storage_class", "spe-ceph-rbd"),
                size=payload.get("uploads_volume_size", "20Gi"),
                access_modes=["ReadWriteOnce"],
                read_only=False,
                mount_path="/uploads",
            )
        ]
    volumes: List[VolumeSpec] = []
    for holder in data_holders:
        holder_id = holder.get("id", "dh")
        volumes.append(
            VolumeSpec(
                name=f"uploads-{holder_id}",
                storage_class=holder.get("storage_class", "spe-ceph-rbd"),
                size=holder.get("size", payload.get("uploads_volume_size", "20Gi")),
                access_modes=["ReadWriteOnce"],
                read_only=False,
                mount_path=f"/uploads/{holder_id}",
            )
        )
    return volumes


def _ingress_network_factory(
    payload: Dict[str, Any], profile: NetworkPolicyProfile
) -> NetworkConfig:
    ingress_rules = [
        CIDRRule(rule.get("cidr", "0.0.0.0/0"), rule.get("ports", [22]))
        for rule in payload.get("allowed_ingress", [])
    ]
    egress_rules = [
        CIDRRule(rule.get("cidr", "0.0.0.0/0"), rule.get("ports", []))
        for rule in payload.get("allowed_egress", [])
    ]
    return NetworkConfig(profile=profile, ingress=ingress_rules, egress=egress_rules)


def _setup_network_factory(
    payload: Dict[str, Any], profile: NetworkPolicyProfile
) -> NetworkConfig:
    selector = payload.get("proxy_selector") or DEFAULT_PROXY_SELECTOR
    return NetworkConfig(profile=profile, proxy_selector=selector)


def _ingress_connection_secret_factory(
    event: PermitEvent, workspace: WorkspaceSpec, payload: Dict[str, Any]
) -> Dict[str, str]:
    if payload.get("connection_secret"):
        return payload["connection_secret"]
    return {
        "username": payload.get("service_user", f"permit-{event.permit_id}"),
        "password": payload.get("service_password", "generated-secret"),
    }


def _ingress_connection_info_factory(
    workspace: WorkspaceSpec,
    payload: Dict[str, Any],
    secret: Optional[Dict[str, str]],
) -> Dict[str, Any]:
    if payload.get("connection"):
        return payload["connection"]
    username = payload.get("service_user")
    password = payload.get("service_password")
    if secret:
        username = secret.get("username", username)
        password = secret.get("password", password)
    return {
        "protocol": "sftp",
        "host": f"{workspace.name}.{workspace.namespace}.svc.cluster.local",
        "port": 22,
        "username": username,
        "password": password,
    }


WORKSPACE_CONFIG: Dict[WorkspaceType, WorkspaceConfigEntry] = {
    WorkspaceType.INGRESS: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-ingress:stable",
        network_profile=NetworkPolicyProfile.INGRESS,
        default_env={"SERVICE_MODE": "sftp"},
        require_user=False,
        volume_factory=_ingress_volume_factory,
        network_factory=_ingress_network_factory,
        connection_secret_factory=_ingress_connection_secret_factory,
        connection_info_factory=_ingress_connection_info_factory,
    ),
    WorkspaceType.PREPROCESS: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-hdab-preprocess:stable",
        network_profile=NetworkPolicyProfile.PREPROCESS,
        volume_templates=[
            VolumeTemplate(
                name="raw",
                mount_path="/raw",
                read_only=True,
                access_modes=["ReadOnlyMany"],
                default_size="200Gi",
                size_key="raw_volume_size",
            ),
            VolumeTemplate(
                name="prepared",
                mount_path="/prepared",
                read_only=False,
                access_modes=["ReadWriteOnce"],
                default_size="200Gi",
                size_key="prepared_volume_size",
            ),
        ],
    ),
    WorkspaceType.REVIEW: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-hdab-review:stable",
        network_profile=NetworkPolicyProfile.REVIEW,
        volume_templates=[
            VolumeTemplate(
                name="prepared",
                mount_path="/prepared",
                read_only=True,
                access_modes=["ReadOnlyMany"],
                default_size="200Gi",
                size_key="prepared_volume_size",
            ),
        ],
    ),
    WorkspaceType.SETUP: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-researcher-setup:stable",
        network_profile=NetworkPolicyProfile.SETUP,
        default_env={"PROXY_ENABLED": "true"},
        volume_templates=[
            VolumeTemplate(
                name="project",
                mount_path="/project",
                read_only=False,
                access_modes=["ReadWriteMany"],
                default_size="100Gi",
                size_key="project_volume_size",
            ),
        ],
        network_factory=_setup_network_factory,
    ),
    WorkspaceType.SETUP_REVIEW: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-setup-review:stable",
        network_profile=NetworkPolicyProfile.SETUP_REVIEW,
        volume_templates=[
            VolumeTemplate(
                name="project",
                mount_path="/project",
                read_only=True,
                access_modes=["ReadOnlyMany"],
                default_size="100Gi",
                size_key="project_volume_size",
            ),
        ],
    ),
    WorkspaceType.ANALYSIS: WorkspaceConfigEntry(
        image="ghcr.io/spe/workspace-analysis:stable",
        network_profile=NetworkPolicyProfile.ANALYSIS,
        default_env={"INTERNET_ACCESS": "disabled"},
        volume_templates=[
            VolumeTemplate(
                name="prepared",
                mount_path="/prepared_data",
                read_only=True,
                access_modes=["ReadOnlyMany"],
                default_size="200Gi",
                size_key="prepared_volume_size",
            ),
            VolumeTemplate(
                name="outputs",
                mount_path="/outputs",
                read_only=False,
                access_modes=["ReadWriteOnce"],
                default_size="200Gi",
                size_key="outputs_volume_size",
            ),
            VolumeTemplate(
                name="project",
                mount_path="/project",
                read_only=False,
                access_modes=["ReadWriteMany"],
                default_size="100Gi",
                size_key="project_volume_size",
            ),
        ],
    ),
}


class WorkspaceOrchestrator:
    """Primary entry point for orchestrating workspace lifecycles."""

    def __init__(
        self,
        config: AppConfig,
        state_manager: WorkspaceStateManager,
        event_publisher: RabbitMQPublisher,
        audit_publisher: AuditEventPublisher,
    ) -> None:
        self._config = config
        self._state_manager = state_manager
        self._event_publisher = event_publisher
        self._audit_publisher = audit_publisher

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def handle_event(self, event: PermitEvent) -> None:
        """Route an incoming permit event to the correct orchestration logic."""

        LOGGER.info("Handling permit event", extra={"event_type": event.type, "permit_id": event.permit_id})
        if event.type == EventType.PERMIT_STATUS_UPDATED and event.status:
            self._handle_status_transition(event)
        elif event.type == EventType.PERMIT_INGRESS_INITIATED:
            self._provision_workspace(event, WorkspaceType.INGRESS, self._build_ingress_plan)
        elif event.type == EventType.WORKSPACE_STOP_REQUESTED:
            self._stop_workspace(event.permit_id)
        elif event.type == EventType.WORKSPACE_START_REQUESTED:
            self._start_workspace(event.permit_id)
        elif event.type == EventType.PERMIT_DELETED:
            self._destroy_all(event.permit_id)
        else:
            LOGGER.warning("Received unsupported event", extra={"type": event.type})

    # ------------------------------------------------------------------
    # Event Handlers
    # ------------------------------------------------------------------
    def _handle_status_transition(self, event: PermitEvent) -> None:
        status = event.status
        assert status is not None
        if status == PermitStatus.DATA_PREPARATION_PENDING:
            self._destroy_stack(event.permit_id, WorkspaceType.INGRESS)
            self._provision_workspace(event, WorkspaceType.PREPROCESS, self._build_preprocess_plan)
        elif status == PermitStatus.DATA_PREPARATION_REVIEW_PENDING:
            self._scale_stack(event.permit_id, WorkspaceType.PREPROCESS, replicas=0)
            self._provision_workspace(event, WorkspaceType.REVIEW, self._build_review_plan)
        elif status == PermitStatus.DATA_PREPARATION_REWORK:
            self._destroy_stack(event.permit_id, WorkspaceType.REVIEW)
            self._scale_stack(event.permit_id, WorkspaceType.PREPROCESS, replicas=1)
            self._state_manager.set_status(event.permit_id, WorkspaceType.PREPROCESS.value.upper())
        elif status == PermitStatus.WORKSPACE_SETUP_PENDING:
            self._destroy_stack(event.permit_id, WorkspaceType.REVIEW)
            self._destroy_stack(event.permit_id, WorkspaceType.PREPROCESS)
            self._provision_workspace(event, WorkspaceType.SETUP, self._build_setup_plan)
        elif status == PermitStatus.WORKSPACE_SETUP_REVIEW_PENDING:
            self._scale_stack(event.permit_id, WorkspaceType.SETUP, replicas=0)
            self._provision_workspace(event, WorkspaceType.SETUP_REVIEW, self._build_setup_review_plan)
        elif status == PermitStatus.WORKSPACE_SETUP_REWORK:
            self._destroy_stack(event.permit_id, WorkspaceType.SETUP_REVIEW)
            self._scale_stack(event.permit_id, WorkspaceType.SETUP, replicas=1)
            self._state_manager.set_status(event.permit_id, WorkspaceType.SETUP.value.upper())
        elif status == PermitStatus.ANALYSIS_ACTIVE:
            self._destroy_stack(event.permit_id, WorkspaceType.SETUP_REVIEW)
            self._provision_workspace(event, WorkspaceType.ANALYSIS, self._build_analysis_plan)
        elif status == PermitStatus.ARCHIVED:
            self._scale_stack(event.permit_id, WorkspaceType.ANALYSIS, replicas=0)
            self._state_manager.set_status(event.permit_id, PermitStatus.ARCHIVED.value)
        elif status == PermitStatus.AWAITING_INGRESS:
            LOGGER.info("Awaiting ingress - no action taken", extra={"permit_id": event.permit_id})
        else:
            LOGGER.warning("Unhandled permit status", extra={"status": status})

    # ------------------------------------------------------------------
    # Plan Builders
    # ------------------------------------------------------------------
    def _provision_workspace(
        self,
        event: PermitEvent,
        workspace_type: WorkspaceType,
        builder: Callable[[PermitEvent], WorkspacePlan],
        action: str = "PROVISION_WORKSPACE",
    ) -> None:
        try:
            plan = builder(event)
        except Exception as exc:
            LOGGER.exception(
                "Failed to build workspace plan",
                extra={"permit_id": event.permit_id, "workspace_type": workspace_type.value},
                exc_info=exc,
            )
            self._handle_operation_failure(
                permit_id=event.permit_id,
                workspace_type=workspace_type,
                action=action,
                error=exc,
                status=WorkspaceLifecycleStatus.PROVISIONING_FAILED,
                extra_details={"stage": "plan_build"},
            )
            return
        self._apply_and_record(event.permit_id, workspace_type, plan, action=action)

    def _build_ingress_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.INGRESS)

    def _build_preprocess_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.PREPROCESS)

    def _build_review_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.REVIEW)

    def _build_setup_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.SETUP)

    def _build_setup_review_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.SETUP_REVIEW)

    def _build_analysis_plan(self, event: PermitEvent) -> WorkspacePlan:
        return self._build_plan_from_config(event, WorkspaceType.ANALYSIS)

    def _build_plan_from_config(
        self, event: PermitEvent, workspace_type: WorkspaceType
    ) -> WorkspacePlan:
        payload = event.payload or {}
        config = WORKSPACE_CONFIG[workspace_type]
        default_volumes = self._resolve_default_volumes(config, payload)
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=workspace_type,
            payload=payload,
            default_image=config.image,
            default_volumes=default_volumes,
            default_env=config.default_env,
            require_user=config.require_user,
        )
        if config.network_factory:
            network = config.network_factory(payload, config.network_profile)
        else:
            network = NetworkConfig(profile=config.network_profile)
        connection_secret = payload.get("connection_secret")
        if config.connection_secret_factory:
            connection_secret = config.connection_secret_factory(
                event, workspace, payload
            )
        connection_info = payload.get("connection")
        if not connection_info:
            if config.connection_info_factory:
                connection_info = config.connection_info_factory(
                    workspace, payload, connection_secret
                )
            else:
                connection_info = self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, workspace_type),
            workspace_spec=workspace,
            network=network,
            connection_secret=connection_secret,
            connection_info=connection_info,
        )

    def _resolve_default_volumes(
        self, config: WorkspaceConfigEntry, payload: Dict[str, Any]
    ) -> Iterable[VolumeSpec]:
        if config.volume_factory:
            return list(config.volume_factory(payload))
        if config.volume_templates:
            return [template.build(payload) for template in config.volume_templates]
        return []

    # ------------------------------------------------------------------
    # Plan Application
    # ------------------------------------------------------------------
    def _apply_and_record(
        self,
        permit_id: str,
        workspace_type: WorkspaceType,
        plan: WorkspacePlan,
        *,
        action: str = "PROVISION_WORKSPACE",
    ) -> None:
        LOGGER.info(
            "Applying workspace plan",
            extra={"permit_id": permit_id, "workspace_type": workspace_type, "stack": plan.stack_name},
        )
        success = True
        if self._config.disable_pulumi:
            LOGGER.warning("Pulumi execution disabled; skipping stack update")
        else:
            success = self._apply_stack(permit_id, workspace_type, plan, action)
        if not success:
            return
        if plan.connection_info:
            self._state_manager.set_connection_details(permit_id, plan.connection_info)
        self._state_manager.set_plan(permit_id, workspace_type.value, self._plan_to_dict(plan))
        self._state_manager.set_status(permit_id, workspace_type.value.upper())
        details = {
            "workspaceType": workspace_type.value,
            "stackName": plan.stack_name,
            "pulumiDisabled": self._config.disable_pulumi,
        }
        self._publish_audit_event(permit_id, action, "SUCCESS", details)

    def _apply_stack(
        self,
        permit_id: str,
        workspace_type: WorkspaceType,
        plan: WorkspacePlan,
        action: str,
    ) -> bool:
        try:
            stack = self._create_or_select_stack(plan)
            if plan.refresh and self._config.pulumi.refresh_before_update:
                stack.refresh(on_output=lambda line: LOGGER.debug(line))
            result = stack.up(on_output=lambda line: LOGGER.info(line))
        except Exception as exc:
            LOGGER.exception(
                "Pulumi stack update failed",
                extra={"stack": plan.stack_name, "permit_id": permit_id, "workspace_type": workspace_type.value},
                exc_info=exc,
            )
            self._handle_operation_failure(
                permit_id=permit_id,
                workspace_type=workspace_type,
                action=action,
                error=exc,
                plan=plan,
                status=WorkspaceLifecycleStatus.PROVISIONING_FAILED,
                extra_details={"stage": "apply"},
            )
            return False
        exports = {**plan.exports, **(result.outputs or {})}
        plan.exports = exports
        LOGGER.info("Pulumi stack applied", extra={"stack": plan.stack_name, "outputs": exports})
        return True

    def _handle_operation_failure(
        self,
        *,
        permit_id: str,
        workspace_type: Optional[WorkspaceType],
        action: str,
        error: Exception,
        status: WorkspaceLifecycleStatus,
        plan: Optional[WorkspacePlan] = None,
        stack_name: Optional[str] = None,
        routing_key: str = "permit.workspace.provisioning_failed",
        extra_details: Optional[Dict[str, Any]] = None,
    ) -> None:
        stack = stack_name or (plan.stack_name if plan else None)
        status_value = status.value if isinstance(status, WorkspaceLifecycleStatus) else str(status)
        self._state_manager.set_status(permit_id, status_value)
        failure_payload: Dict[str, Any] = {
            "permitId": permit_id,
            "action": action,
            "status": status_value,
            "error": {
                "message": str(error),
                "type": error.__class__.__name__,
            },
        }
        if workspace_type is not None:
            failure_payload["workspaceType"] = workspace_type.value
        if stack:
            failure_payload["stackName"] = stack
        if extra_details:
            failure_payload["details"] = extra_details
        try:
            self._event_publisher.publish(routing_key, failure_payload)
        except Exception:
            LOGGER.exception(
                "Failed to publish workspace failure event",
                extra={"routing_key": routing_key, "permit_id": permit_id, "workspace_type": getattr(workspace_type, "value", None)},
            )
        audit_details = {
            "workspaceType": workspace_type.value if workspace_type else None,
            "stackName": stack,
            "status": status_value,
            "error": str(error),
        }
        if extra_details:
            audit_details.update(extra_details)
        self._publish_audit_event(permit_id, action, "FAILURE", audit_details)

    def _publish_audit_event(
        self, permit_id: str, action: str, outcome: str, details: Dict[str, Any]
    ) -> None:
        filtered_details = {key: value for key, value in details.items() if value is not None}
        self._audit_publisher.publish(permit_id, action, outcome, filtered_details)

    def _create_or_select_stack(self, plan: WorkspacePlan) -> auto.Stack:
        program = self._build_pulumi_program(plan)
        kwargs: Dict[str, Any] = {"stack_name": plan.stack_name, "project_name": self._config.pulumi.project_name}
        if self._config.pulumi.work_dir:
            kwargs["work_dir"] = self._config.pulumi.work_dir
        else:
            kwargs["program"] = program
        stack = auto.create_or_select_stack(**kwargs)
        stack.workspace.install_plugin("kubernetes", "v4.6.0")
        return stack

    def _build_pulumi_program(self, plan: WorkspacePlan):
        def pulumi_program() -> None:
            pvcs = provision_pvcs(
                plan.workspace_spec.name,
                plan.workspace_spec.namespace,
                plan.workspace_spec.volumes,
            )
            secret = (
                create_secret(plan.workspace_spec.name, plan.workspace_spec.namespace, plan.connection_secret)
                if plan.connection_secret
                else None
            )
            build_workspace_deployment(plan.workspace_spec, pvcs, secret=secret)
            build_network_policy(
                name=plan.workspace_spec.name,
                namespace=plan.workspace_spec.namespace,
                profile=plan.network.profile,
                ingress_rules=plan.network.ingress,
                egress_rules=plan.network.egress,
                proxy_selector=plan.network.proxy_selector,
            )
            exports = plan.connection_info or {}
            if exports:
                pulumi.export("connection", exports)

        return pulumi_program

    # ------------------------------------------------------------------
    # Stack Helpers
    # ------------------------------------------------------------------
    def _destroy_stack(self, permit_id: str, workspace_type: WorkspaceType) -> bool:
        stack_name = self._stack_name(permit_id, workspace_type)
        LOGGER.info("Destroying workspace stack", extra={"stack": stack_name})
        stored_plan = self._state_manager.get_plan(permit_id, workspace_type.value)
        if self._config.disable_pulumi:
            if stored_plan:
                self._state_manager.delete_plan(permit_id, workspace_type.value)
            self._publish_audit_event(
                permit_id,
                "DESTROY_WORKSPACE",
                "SUCCESS",
                {
                    "workspaceType": workspace_type.value,
                    "stackName": stack_name,
                    "pulumiDisabled": True,
                },
            )
            return True
        try:
            stack = auto.select_stack(stack_name=stack_name, project_name=self._config.pulumi.project_name)
        except auto.StackNotFoundError:
            LOGGER.info("Stack not found; nothing to destroy", extra={"stack": stack_name})
            if stored_plan:
                self._state_manager.delete_plan(permit_id, workspace_type.value)
            self._publish_audit_event(
                permit_id,
                "DESTROY_WORKSPACE",
                "SUCCESS",
                {"workspaceType": workspace_type.value, "stackName": stack_name, "message": "Stack not found"},
            )
            return True
        try:
            stack.destroy(on_output=lambda line: LOGGER.info(line))
        except Exception as exc:
            LOGGER.exception(
                "Pulumi stack destroy failed",
                extra={"stack": stack_name, "permit_id": permit_id, "workspace_type": workspace_type.value},
                exc_info=exc,
            )
            self._handle_operation_failure(
                permit_id=permit_id,
                workspace_type=workspace_type,
                action="DESTROY_WORKSPACE",
                error=exc,
                status=WorkspaceLifecycleStatus.DESTROY_FAILED,
                stack_name=stack_name,
                routing_key="permit.workspace.destroy_failed",
                extra_details={"stage": "destroy"},
            )
            return False
        stack.workspace.remove_stack(stack_name)
        if stored_plan:
            self._state_manager.delete_plan(permit_id, workspace_type.value)
        self._publish_audit_event(
            permit_id,
            "DESTROY_WORKSPACE",
            "SUCCESS",
            {"workspaceType": workspace_type.value, "stackName": stack_name},
        )
        return True

    def _scale_stack(self, permit_id: str, workspace_type: WorkspaceType, replicas: int) -> bool:
        stack_name = self._stack_name(permit_id, workspace_type)
        LOGGER.info(
            "Scaling workspace stack",
            extra={"stack": stack_name, "replicas": replicas},
        )
        plan_data = self._state_manager.get_plan(permit_id, workspace_type.value)
        if not plan_data:
            LOGGER.warning("No stored plan for workspace; scaling skipped", extra={"permit_id": permit_id, "workspace_type": workspace_type.value})
            return False
        plan = self._plan_from_dict(plan_data)
        plan.stack_name = stack_name
        plan.workspace_spec.replicas = replicas
        original_profile = plan.network.profile
        if replicas == 0:
            plan.network.profile = NetworkPolicyProfile.STOPPED
        action = "SCALE_WORKSPACE"
        if self._config.disable_pulumi:
            LOGGER.info("Pulumi disabled; simulated scaling applied")
            if replicas > 0:
                plan.network.profile = original_profile
            self._state_manager.set_plan(permit_id, workspace_type.value, self._plan_to_dict(plan))
            self._publish_audit_event(
                permit_id,
                action,
                "SUCCESS",
                {
                    "workspaceType": workspace_type.value,
                    "stackName": stack_name,
                    "replicas": replicas,
                    "pulumiDisabled": True,
                },
            )
            return True
        success = self._apply_stack(permit_id, workspace_type, plan, action)
        if not success:
            return False
        if replicas > 0:
            plan.network.profile = original_profile
        self._state_manager.set_plan(permit_id, workspace_type.value, self._plan_to_dict(plan))
        self._publish_audit_event(
            permit_id,
            action,
            "SUCCESS",
            {"workspaceType": workspace_type.value, "stackName": stack_name, "replicas": replicas},
        )
        return True

    def _stop_workspace(self, permit_id: str) -> None:
        LOGGER.info("Stop requested for workspace", extra={"permit_id": permit_id})
        success = self._scale_stack(permit_id, WorkspaceType.ANALYSIS, replicas=0)
        if success:
            self._state_manager.set_status(permit_id, "STOPPED")
            self._publish_audit_event(
                permit_id,
                "STOP_WORKSPACE",
                "SUCCESS",
                {"workspaceType": WorkspaceType.ANALYSIS.value},
            )
        else:
            self._publish_audit_event(
                permit_id,
                "STOP_WORKSPACE",
                "FAILURE",
                {
                    "workspaceType": WorkspaceType.ANALYSIS.value,
                    "message": "Scaling operation failed; see prior audit events.",
                },
            )

    def _start_workspace(self, permit_id: str) -> None:
        LOGGER.info("Start requested for workspace", extra={"permit_id": permit_id})
        success = self._scale_stack(permit_id, WorkspaceType.ANALYSIS, replicas=1)
        if success:
            self._state_manager.set_status(permit_id, "RUNNING")
            self._publish_audit_event(
                permit_id,
                "START_WORKSPACE",
                "SUCCESS",
                {"workspaceType": WorkspaceType.ANALYSIS.value},
            )
        else:
            self._publish_audit_event(
                permit_id,
                "START_WORKSPACE",
                "FAILURE",
                {
                    "workspaceType": WorkspaceType.ANALYSIS.value,
                    "message": "Scaling operation failed; see prior audit events.",
                },
            )

    def _destroy_all(self, permit_id: str) -> None:
        LOGGER.info("Destroying all workspace resources", extra={"permit_id": permit_id})
        all_success = True
        for workspace_type in WorkspaceType:
            result = self._destroy_stack(permit_id, workspace_type)
            all_success = all_success and result
        if all_success:
            self._state_manager.clear_permit(permit_id)
        details = {
            "workspaceTypes": [workspace.value for workspace in WorkspaceType],
        }
        if all_success:
            outcome = "SUCCESS"
        else:
            outcome = "FAILURE"
            details["message"] = "One or more workspace stacks reported failures; review individual audit events."
        self._publish_audit_event(
            permit_id,
            "DESTROY_ALL_WORKSPACES",
            outcome,
            details,
        )

    def _plan_to_dict(self, plan: WorkspacePlan) -> Dict[str, Any]:
        return {
            'stack_name': plan.stack_name,
            'workspace': {
                'name': plan.workspace_spec.name,
                'namespace': plan.workspace_spec.namespace,
                'service_account': plan.workspace_spec.service_account_name,
                'replicas': plan.workspace_spec.replicas,
                'annotations': plan.workspace_spec.annotations,
                'container': {
                    'image': plan.workspace_spec.container.image,
                    'resources': plan.workspace_spec.container.resources,
                    'env': plan.workspace_spec.container.env,
                    'command': plan.workspace_spec.container.command,
                    'args': plan.workspace_spec.container.args,
                    'ports': plan.workspace_spec.container.ports,
                },
                'user': {
                    'username': plan.workspace_spec.user.username,
                    'uid': plan.workspace_spec.user.uid,
                    'gid': plan.workspace_spec.user.gid,
                },
                'volumes': [
                    {
                        'name': volume.name,
                        'storage_class': volume.storage_class,
                        'size': volume.size,
                        'access_modes': volume.access_modes,
                        'read_only': volume.read_only,
                        'mount_path': volume.mount_path,
                    }
                    for volume in plan.workspace_spec.volumes
                ],
            },
            'network': {
                'profile': plan.network.profile.value,
                'ingress': [
                    {'cidr': rule.cidr, 'ports': rule.ports}
                    for rule in plan.network.ingress
                ],
                'egress': [
                    {'cidr': rule.cidr, 'ports': rule.ports}
                    for rule in plan.network.egress
                ],
                'proxy_selector': plan.network.proxy_selector,
            },
            'connection_secret': plan.connection_secret,
            'connection_info': plan.connection_info,
        }

    def _plan_from_dict(self, data: Dict[str, Any]) -> WorkspacePlan:
        workspace_data = data['workspace']
        container_data = workspace_data['container']
        container = WorkspaceContainer(
            image=container_data['image'],
            resources=container_data.get('resources', {}),
            env=container_data.get('env', {}),
            command=container_data.get('command'),
            args=container_data.get('args'),
            ports=container_data.get('ports', [3389]),
        )
        user_data = workspace_data['user']
        user = WorkspaceUser(
            username=user_data['username'],
            uid=user_data['uid'],
            gid=user_data['gid'],
        )
        volumes = [
            VolumeSpec(
                name=vol['name'],
                storage_class=vol.get('storage_class', 'spe-ceph-rbd'),
                size=vol.get('size', '10Gi'),
                access_modes=vol.get('access_modes', ['ReadWriteOnce']),
                read_only=vol.get('read_only', False),
                mount_path=vol.get('mount_path'),
            )
            for vol in workspace_data.get('volumes', [])
        ]
        workspace_spec = WorkspaceSpec(
            name=workspace_data['name'],
            namespace=workspace_data['namespace'],
            container=container,
            user=user,
            volumes=volumes,
            service_account_name=workspace_data.get('service_account'),
            replicas=workspace_data.get('replicas', 1),
            annotations=workspace_data.get('annotations', {}),
        )
        network_data = data['network']
        network = NetworkConfig(
            profile=NetworkPolicyProfile(network_data['profile']),
            ingress=[CIDRRule(rule['cidr'], rule.get('ports', [])) for rule in network_data.get('ingress', [])],
            egress=[CIDRRule(rule['cidr'], rule.get('ports', [])) for rule in network_data.get('egress', [])],
            proxy_selector=network_data.get('proxy_selector'),
        )
        return WorkspacePlan(
            stack_name=data.get('stack_name', ''),
            workspace_spec=workspace_spec,
            network=network,
            connection_secret=data.get('connection_secret'),
            connection_info=data.get('connection_info'),
        )

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------
    def _stack_name(self, permit_id: str, workspace_type: WorkspaceType) -> str:
        base = f"{self._config.pulumi.stack_prefix}-{permit_id}-{workspace_type.value}"
        if self._config.pulumi.organization:
            return f"{self._config.pulumi.organization}/{self._config.pulumi.project_name}/{base}"
        return base

    def _resolve_workspace_user(
        self,
        *,
        permit_id: str,
        workspace_type: WorkspaceType,
        payload: Dict[str, Any],
        workspace_payload: Dict[str, Any],
        require_user: bool,
    ) -> WorkspaceUser:
        user_payload = (
            workspace_payload.get("user")
            or payload.get("assignedUser")
            or payload.get("user")
            or {}
        )
        username = user_payload.get("username")
        if not username:
            if require_user:
                raise ValueError(
                    f"Permit event missing assigned user for {workspace_type.value} workspace"
                )
            username = f"user-{permit_id}"
        raw_uid = user_payload.get("uid", user_payload.get("id"))
        if raw_uid is None and require_user:
            raise ValueError(
                f"Permit event missing user identifier for {workspace_type.value} workspace"
            )
        uid = str(raw_uid if raw_uid is not None else 2000)
        raw_gid = user_payload.get("gid", raw_uid)
        gid = str(raw_gid if raw_gid is not None else 2000)
        return WorkspaceUser(username=username, uid=uid, gid=gid)

    def _default_workspace_spec(
        self,
        permit_id: str,
        workspace_type: WorkspaceType,
        payload: Dict[str, Any],
        default_image: str,
        default_volumes: Iterable[VolumeSpec],
        default_env: Optional[Dict[str, str]] = None,
        *,
        require_user: bool = True,
    ) -> WorkspaceSpec:
        workspace_payload = payload.get("workspace", {})
        namespace = workspace_payload.get("namespace") or f"permit-{permit_id}"
        name = workspace_payload.get("name") or f"{permit_id}-{workspace_type.value}"
        user = self._resolve_workspace_user(
            permit_id=permit_id,
            workspace_type=workspace_type,
            payload=payload,
            workspace_payload=workspace_payload,
            require_user=require_user,
        )
        container = WorkspaceContainer(
            image=workspace_payload.get("image") or default_image,
            resources=workspace_payload.get("resources") or {},
            env={**(default_env or {}), **workspace_payload.get("env", {})},
            command=workspace_payload.get("command"),
            args=workspace_payload.get("args"),
            ports=workspace_payload.get("ports") or [3389],
        )
        raw_volumes = workspace_payload.get("volumes")
        if raw_volumes is None or len(raw_volumes) == 0:
            raw_volumes = [
                {
                    "name": volume.name,
                    "storage_class": volume.storage_class,
                    "size": volume.size,
                    "access_modes": volume.access_modes,
                    "read_only": volume.read_only,
                    "mount_path": volume.mount_path,
                }
                for volume in default_volumes
            ]
        volume_specs = [
            VolumeSpec(
                name=volume.get("name"),
                storage_class=volume.get("storage_class", "spe-ceph-rbd"),
                size=volume.get("size", "10Gi"),
                access_modes=volume.get("access_modes", ["ReadWriteOnce"]),
                read_only=volume.get("read_only", False),
                mount_path=volume.get("mount_path"),
            )
            for volume in raw_volumes
        ]
        replicas = workspace_payload.get("replicas", 1)
        annotations = workspace_payload.get("annotations", {})
        return WorkspaceSpec(
            name=name,
            namespace=namespace,
            container=container,
            user=user,
            volumes=volume_specs,
            service_account_name=workspace_payload.get("service_account"),
            replicas=replicas,
            annotations=annotations,
        )

    def _default_connection(self, workspace: WorkspaceSpec) -> Dict[str, Any]:
        return {
            "protocol": "rdp",
            "host": f"{workspace.name}.{workspace.namespace}.svc.cluster.local",
            "port": workspace.container.ports[0] if workspace.container.ports else 3389,
            "username": workspace.user.username,
            "password": "managed-in-secret",
        }

__all__ = [
    "WorkspaceOrchestrator",
    "WorkspacePlan",
    "WorkspaceType",
    "NetworkConfig",
]
