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
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.INGRESS,
            payload=payload,
            default_image="ghcr.io/spe/workspace-ingress:stable",
            default_volumes=self._build_ingress_volumes(payload),
            default_env={"SERVICE_MODE": "sftp"},
            require_user=False,
        )
        network = NetworkConfig(
            profile=NetworkPolicyProfile.INGRESS,
            ingress=[CIDRRule(rule.get("cidr", "0.0.0.0/0"), rule.get("ports", [22])) for rule in payload.get("allowed_ingress", [])],
        )
        connection_secret = payload.get("connection_secret") or {
            "username": payload.get("service_user", f"permit-{event.permit_id}"),
            "password": payload.get("service_password", "generated-secret"),
        }
        connection_info = payload.get("connection") or {
            "protocol": "sftp",
            "host": f"{workspace.name}.svc.cluster.local",
            "port": 22,
            "username": connection_secret.get("username"),
            "password": connection_secret.get("password"),
        }
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.INGRESS),
            workspace_spec=workspace,
            network=network,
            connection_secret=connection_secret,
            connection_info=connection_info,
        )

    def _build_preprocess_plan(self, event: PermitEvent) -> WorkspacePlan:
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.PREPROCESS,
            payload=payload,
            default_image="ghcr.io/spe/workspace-hdab-preprocess:stable",
            default_volumes=self._build_preprocess_volumes(payload),
        )
        network = NetworkConfig(profile=NetworkPolicyProfile.PREPROCESS)
        connection_info = payload.get("connection") or self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.PREPROCESS),
            workspace_spec=workspace,
            network=network,
            connection_info=connection_info,
        )

    def _build_review_plan(self, event: PermitEvent) -> WorkspacePlan:
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.REVIEW,
            payload=payload,
            default_image="ghcr.io/spe/workspace-hdab-review:stable",
            default_volumes=self._build_review_volumes(payload),
        )
        network = NetworkConfig(profile=NetworkPolicyProfile.REVIEW)
        connection_info = payload.get("connection") or self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.REVIEW),
            workspace_spec=workspace,
            network=network,
            connection_info=connection_info,
        )

    def _build_setup_plan(self, event: PermitEvent) -> WorkspacePlan:
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.SETUP,
            payload=payload,
            default_image="ghcr.io/spe/workspace-researcher-setup:stable",
            default_volumes=self._build_setup_volumes(payload),
            default_env={"PROXY_ENABLED": "true"},
        )
        network = NetworkConfig(
            profile=NetworkPolicyProfile.SETUP,
            proxy_selector=payload.get("proxy_selector")
            or {"namespaceSelector": {"matchLabels": {"kubernetes.io/metadata.name": "infra"}}, "podSelector": {"matchLabels": {"app": "spe-proxy"}}},
        )
        connection_info = payload.get("connection") or self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.SETUP),
            workspace_spec=workspace,
            network=network,
            connection_info=connection_info,
        )

    def _build_setup_review_plan(self, event: PermitEvent) -> WorkspacePlan:
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.SETUP_REVIEW,
            payload=payload,
            default_image="ghcr.io/spe/workspace-setup-review:stable",
            default_volumes=self._build_setup_review_volumes(payload),
        )
        network = NetworkConfig(profile=NetworkPolicyProfile.SETUP_REVIEW)
        connection_info = payload.get("connection") or self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.SETUP_REVIEW),
            workspace_spec=workspace,
            network=network,
            connection_info=connection_info,
        )

    def _build_analysis_plan(self, event: PermitEvent) -> WorkspacePlan:
        payload = event.payload or {}
        workspace = self._default_workspace_spec(
            permit_id=event.permit_id,
            workspace_type=WorkspaceType.ANALYSIS,
            payload=payload,
            default_image="ghcr.io/spe/workspace-analysis:stable",
            default_volumes=self._build_analysis_volumes(payload),
            default_env={"INTERNET_ACCESS": "disabled"},
        )
        network = NetworkConfig(profile=NetworkPolicyProfile.ANALYSIS)
        connection_info = payload.get("connection") or self._default_connection(workspace)
        return WorkspacePlan(
            stack_name=self._stack_name(event.permit_id, WorkspaceType.ANALYSIS),
            workspace_spec=workspace,
            network=network,
            connection_info=connection_info,
        )

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
    def _destroy_stack(self, permit_id: str, workspace_type: WorkspaceType) -> None:
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
            return
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
            return
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
            return
        stack.workspace.remove_stack(stack_name)
        if stored_plan:
            self._state_manager.delete_plan(permit_id, workspace_type.value)
        self._publish_audit_event(
            permit_id,
            "DESTROY_WORKSPACE",
            "SUCCESS",
            {"workspaceType": workspace_type.value, "stackName": stack_name},
        )

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

    def _start_workspace(self, permit_id: str) -> None:
        LOGGER.info("Start requested for workspace", extra={"permit_id": permit_id})
        success = self._scale_stack(permit_id, WorkspaceType.ANALYSIS, replicas=1)
        if success:
            self._state_manager.set_status(permit_id, "RUNNING")

    def _destroy_all(self, permit_id: str) -> None:
        LOGGER.info("Destroying all workspace resources", extra={"permit_id": permit_id})
        for workspace_type in WorkspaceType:
            self._destroy_stack(permit_id, workspace_type)
        self._state_manager.clear_permit(permit_id)

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

    def _build_ingress_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        data_holders = payload.get("data_holders", [])
        if not data_holders:
            return [
                VolumeSpec(
                    name="uploads",
                    storage_class="spe-ceph-rbd",
                    size="20Gi",
                    access_modes=["ReadWriteOnce"],
                    read_only=False,
                    mount_path="/uploads",
                )
            ]
        volumes = []
        for holder in data_holders:
            volumes.append(
                VolumeSpec(
                    name=f"uploads-{holder.get('id', 'dh')}",
                    storage_class=holder.get("storage_class", "spe-ceph-rbd"),
                    size=holder.get("size", "20Gi"),
                    access_modes=["ReadWriteOnce"],
                    read_only=False,
                    mount_path=f"/uploads/{holder.get('id', 'dh')}",
                )
            )
        return volumes

    def _build_preprocess_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        return [
            VolumeSpec(
                name="raw",
                storage_class="spe-ceph-rbd",
                size=payload.get("raw_volume_size", "200Gi"),
                access_modes=["ReadOnlyMany"],
                read_only=True,
                mount_path="/raw",
            ),
            VolumeSpec(
                name="prepared",
                storage_class="spe-ceph-rbd",
                size=payload.get("prepared_volume_size", "200Gi"),
                access_modes=["ReadWriteOnce"],
                read_only=False,
                mount_path="/prepared",
            ),
        ]

    def _build_review_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        return [
            VolumeSpec(
                name="prepared",
                storage_class="spe-ceph-rbd",
                size=payload.get("prepared_volume_size", "200Gi"),
                access_modes=["ReadOnlyMany"],
                read_only=True,
                mount_path="/prepared",
            )
        ]

    def _build_setup_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        return [
            VolumeSpec(
                name="project",
                storage_class="spe-ceph-rbd",
                size=payload.get("project_volume_size", "100Gi"),
                access_modes=["ReadWriteMany"],
                read_only=False,
                mount_path="/project",
            )
        ]

    def _build_setup_review_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        return [
            VolumeSpec(
                name="project",
                storage_class="spe-ceph-rbd",
                size=payload.get("project_volume_size", "100Gi"),
                access_modes=["ReadOnlyMany"],
                read_only=True,
                mount_path="/project",
            )
        ]

    def _build_analysis_volumes(self, payload: Dict[str, Any]) -> Iterable[VolumeSpec]:
        return [
            VolumeSpec(
                name="prepared",
                storage_class="spe-ceph-rbd",
                size=payload.get("prepared_volume_size", "200Gi"),
                access_modes=["ReadOnlyMany"],
                read_only=True,
                mount_path="/data",
            ),
            VolumeSpec(
                name="outputs",
                storage_class="spe-ceph-rbd",
                size=payload.get("outputs_volume_size", "200Gi"),
                access_modes=["ReadWriteOnce"],
                read_only=False,
                mount_path="/outputs",
            ),
            VolumeSpec(
                name="project",
                storage_class="spe-ceph-rbd",
                size=payload.get("project_volume_size", "100Gi"),
                access_modes=["ReadWriteMany"],
                read_only=False,
                mount_path="/project",
            ),
        ]


__all__ = [
    "WorkspaceOrchestrator",
    "WorkspacePlan",
    "WorkspaceType",
    "NetworkConfig",
]
