"""Pulumi helpers for Kubernetes PersistentVolumeClaims."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import pulumi
from pulumi_kubernetes.core.v1 import PersistentVolumeClaim


@dataclass
class VolumeSpec:
    """Specification for a persistent volume claim."""

    name: str
    storage_class: str
    size: str
    access_modes: List[str]
    read_only: bool = False
    mount_path: Optional[str] = None


def create_pvc(name: str, namespace: str, spec: VolumeSpec) -> PersistentVolumeClaim:
    """Create a single PVC using Pulumi."""

    return PersistentVolumeClaim(
        resource_name=f"{name}-{spec.name}-pvc",
        metadata={"name": f"{name}-{spec.name}", "namespace": namespace},
        spec={
            "accessModes": spec.access_modes,
            "resources": {"requests": {"storage": spec.size}},
            "storageClassName": spec.storage_class,
        },
        opts=pulumi.ResourceOptions(additional_secret_outputs=["metadata"]),
    )


def provision_pvcs(name: str, namespace: str, volumes: List[VolumeSpec]) -> List[PersistentVolumeClaim]:
    """Provision all PVCs required by the workspace."""

    return [create_pvc(name, namespace, volume) for volume in volumes]


__all__ = ["VolumeSpec", "provision_pvcs"]
