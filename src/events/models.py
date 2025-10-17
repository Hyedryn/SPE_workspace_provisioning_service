"""Domain models for workspace provisioning events."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, Optional


class PermitStatus(str, Enum):
    """Permit statuses relevant to workspace provisioning."""

    AWAITING_INGRESS = "AWAITING_INGRESS"
    DATA_PREPARATION_PENDING = "DATA_PREPARATION_PENDING"
    DATA_PREPARATION_REVIEW_PENDING = "DATA_PREPARATION_REVIEW_PENDING"
    DATA_PREPARATION_REWORK = "DATA_PREPARATION_REWORK"
    WORKSPACE_SETUP_PENDING = "WORKSPACE_SETUP_PENDING"
    WORKSPACE_SETUP_REVIEW_PENDING = "WORKSPACE_SETUP_REVIEW_PENDING"
    WORKSPACE_SETUP_REWORK = "WORKSPACE_SETUP_REWORK"
    ANALYSIS_ACTIVE = "ANALYSIS_ACTIVE"
    ARCHIVED = "ARCHIVED"


class EventType(str, Enum):
    """Event types published on the message bus."""

    PERMIT_STATUS_UPDATED = "permit.status.updated"
    PERMIT_INGRESS_INITIATED = "permit.ingress.initiated"
    WORKSPACE_STOP_REQUESTED = "permit.workspace.stop_requested"
    WORKSPACE_START_REQUESTED = "permit.workspace.start_requested"
    PERMIT_DELETED = "permit.deleted"


@dataclass
class PermitEvent:
    """Event payload as received from the message bus."""

    type: EventType
    permit_id: str
    status: Optional[PermitStatus] = None
    payload: Optional[Dict[str, Any]] = None
    message_id: Optional[str] = None


__all__ = ["PermitEvent", "PermitStatus", "EventType"]
