"""Pulumi helpers for generating Kubernetes network policies."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

import pulumi
from pulumi_kubernetes.networking.v1 import NetworkPolicy


class NetworkPolicyProfile(str, Enum):
    """Supported network policy profiles for workspaces."""

    INGRESS = "ingress"
    PREPROCESS = "preprocess"
    REVIEW = "review"
    SETUP = "setup"
    SETUP_REVIEW = "setup-review"
    ANALYSIS = "analysis"
    STOPPED = "stopped"


@dataclass
class CIDRRule:
    """CIDR rule for ingress or egress."""

    cidr: str
    ports: List[int] = field(default_factory=list)


def _ports(ports: List[int]) -> List[dict]:
    return [
        {"port": port, "protocol": "TCP"}
        for port in ports
    ]


def build_network_policy(
    name: str,
    namespace: str,
    profile: NetworkPolicyProfile,
    pod_selector: Optional[dict] = None,
    ingress_rules: Optional[List[CIDRRule]] = None,
    egress_rules: Optional[List[CIDRRule]] = None,
    proxy_selector: Optional[dict] = None,
) -> NetworkPolicy:
    """Create a Kubernetes NetworkPolicy tailored for the workspace profile."""

    pod_selector = pod_selector or {"matchLabels": {"app": name}}
    metadata = pulumi.ResourceOptions(additional_secret_outputs=["metadata"])

    ingress = []
    egress = []

    if profile == NetworkPolicyProfile.INGRESS and ingress_rules:
        ingress = [
            {
                "from": [
                    {
                        "ipBlock": {
                            "cidr": rule.cidr,
                        }
                    }
                    for rule in ingress_rules
                ],
                "ports": _ports(rule.ports),
            }
            for rule in ingress_rules
        ]
        egress = [
            {
                "to": [
                    {
                        "ipBlock": {
                            "cidr": rule.cidr,
                        }
                    }
                ],
                "ports": _ports(rule.ports),
            }
            for rule in egress_rules
        ] if egress_rules else []
    elif profile == NetworkPolicyProfile.SETUP and proxy_selector:
        egress = [
            {
                "to": [
                    {
                        "namespaceSelector": proxy_selector.get("namespaceSelector"),
                        "podSelector": proxy_selector.get("podSelector"),
                    }
                ],
            }
        ]
    elif profile in (NetworkPolicyProfile.ANALYSIS, NetworkPolicyProfile.STOPPED):
        ingress = []
        egress = []
    else:
        ingress = [
            {
                "from": [
                    {"podSelector": {"matchLabels": {"role": "hdab"}}},
                ]
            }
        ]

    return NetworkPolicy(
        resource_name=f"{name}-network-policy",
        metadata={"name": f"{name}-np", "namespace": namespace},
        spec={
            "podSelector": pod_selector,
            "policyTypes": ["Ingress", "Egress"],
            "ingress": ingress,
            "egress": egress,
        },
        opts=metadata,
    )


__all__ = ["NetworkPolicyProfile", "build_network_policy", "CIDRRule"]
