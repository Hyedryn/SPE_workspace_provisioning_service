"""Pulumi program that provisions the core workspace pod."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import pulumi
from pulumi_kubernetes.apps.v1 import Deployment
from pulumi_kubernetes.core.v1 import PersistentVolumeClaim, Secret

from .storage import VolumeSpec


@dataclass
class WorkspaceUser:
    """User configuration passed to the workspace."""

    username: str
    uid: str
    gid: str


@dataclass
class WorkspaceContainer:
    """Runtime configuration for the workspace container."""

    image: str
    resources: Dict[str, Dict[str, str]] = field(default_factory=dict)
    env: Dict[str, str] = field(default_factory=dict)
    command: Optional[List[str]] = None
    args: Optional[List[str]] = None
    ports: List[int] = field(default_factory=lambda: [3389])


@dataclass
class WorkspaceSpec:
    """Complete workspace specification for Pulumi."""

    name: str
    namespace: str
    container: WorkspaceContainer
    user: WorkspaceUser
    volumes: List[VolumeSpec] = field(default_factory=list)
    service_account_name: Optional[str] = None
    replicas: int = 1
    annotations: Dict[str, str] = field(default_factory=dict)


def _build_volume_mount(volume: VolumeSpec) -> dict:
    return {
        "name": f"{volume.name}-volume",
        "mountPath": volume.mount_path or f"/mnt/{volume.name}",
        "readOnly": volume.read_only,
    }


def _build_volumes(name: str, namespace: str, volumes: List[VolumeSpec]) -> List[dict]:
    return [
        {
            "name": f"{volume.name}-volume",
            "persistentVolumeClaim": {"claimName": f"{name}-{volume.name}"},
        }
        for volume in volumes
    ]


def create_secret(name: str, namespace: str, connection_payload: Dict[str, str]) -> Secret:
    """Create a Kubernetes secret storing connection credentials."""

    return Secret(
        resource_name=f"{name}-secret",
        metadata={"name": f"{name}-connection", "namespace": namespace},
        string_data=connection_payload,
        opts=pulumi.ResourceOptions(additional_secret_outputs=["data"]),
    )


def build_workspace_deployment(
    spec: WorkspaceSpec, pvcs: List[PersistentVolumeClaim], secret: Optional[Secret] = None
) -> Deployment:
    """Create the workspace deployment."""

    volume_mounts = [_build_volume_mount(volume) for volume in spec.volumes]
    volumes = _build_volumes(spec.name, spec.namespace, spec.volumes)

    env = {
        **spec.container.env,
        "WORKSPACE_USER": spec.user.username,
        "WORKSPACE_UID": spec.user.uid,
        "WORKSPACE_GID": spec.user.gid,
    }

    if secret is not None:
        env["WORKSPACE_SECRET_NAME"] = secret.metadata["name"]

    deployment = Deployment(
        resource_name=f"{spec.name}-deployment",
        metadata={"name": spec.name, "namespace": spec.namespace, "annotations": spec.annotations},
        spec={
            "replicas": spec.replicas,
            "selector": {"matchLabels": {"app": spec.name}},
            "template": {
                "metadata": {
                    "labels": {"app": spec.name},
                    "annotations": spec.annotations,
                },
                "spec": {
                    "serviceAccountName": spec.service_account_name,
                    "containers": [
                        {
                            "name": spec.name,
                            "image": spec.container.image,
                            "env": [{"name": key, "value": value} for key, value in env.items()],
                            "resources": spec.container.resources,
                            "ports": [
                                {"containerPort": port, "name": f"port-{port}"}
                                for port in spec.container.ports
                            ],
                            "volumeMounts": volume_mounts,
                            "command": spec.container.command,
                            "args": spec.container.args,
                        }
                    ],
                    "volumes": volumes,
                },
            },
        },
        opts=pulumi.ResourceOptions(depends_on=pvcs + ([secret] if secret else [])),
    )

    return deployment


__all__ = [
    "WorkspaceSpec",
    "WorkspaceContainer",
    "WorkspaceUser",
    "build_workspace_deployment",
    "create_secret",
]
