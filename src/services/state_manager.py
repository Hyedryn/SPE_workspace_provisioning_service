"""Redis-backed workspace state management service."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from redis import Redis

LOGGER = logging.getLogger(__name__)


class WorkspaceStateManager:
    """Persist and retrieve workspace state using Redis."""

    STATUS_KEY_TEMPLATE = "permit:{permit_id}:status"
    CONNECTION_KEY_TEMPLATE = "permit:{permit_id}:connection"
    HISTORY_KEY_TEMPLATE = "permit:{permit_id}:history"
    PLAN_KEY_TEMPLATE = "permit:{permit_id}:plan:{workspace_type}"

    def __init__(self, redis_client: Redis) -> None:
        self._redis = redis_client

    @staticmethod
    def _status_key(permit_id: str) -> str:
        return WorkspaceStateManager.STATUS_KEY_TEMPLATE.format(permit_id=permit_id)

    @staticmethod
    def _connection_key(permit_id: str) -> str:
        return WorkspaceStateManager.CONNECTION_KEY_TEMPLATE.format(permit_id=permit_id)

    @staticmethod
    def _history_key(permit_id: str) -> str:
        return WorkspaceStateManager.HISTORY_KEY_TEMPLATE.format(permit_id=permit_id)

    @staticmethod
    def _plan_key(permit_id: str, workspace_type: str) -> str:
        return WorkspaceStateManager.PLAN_KEY_TEMPLATE.format(permit_id=permit_id, workspace_type=workspace_type)

    def set_plan(self, permit_id: str, workspace_type: str, plan: Dict[str, Any]) -> None:
        key = self._plan_key(permit_id, workspace_type)
        LOGGER.debug('Persisting workspace plan', extra={'permit_id': permit_id, 'workspace_type': workspace_type})
        self._redis.set(key, json.dumps(plan))

    def delete_plan(self, permit_id: str, workspace_type: str) -> None:
        key = self._plan_key(permit_id, workspace_type)
        LOGGER.debug('Deleting workspace plan', extra={'permit_id': permit_id, 'workspace_type': workspace_type})
        self._redis.delete(key)

    def get_plan(self, permit_id: str, workspace_type: str) -> Optional[Dict[str, Any]]:
        raw = self._redis.get(self._plan_key(permit_id, workspace_type))
        if not raw:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            LOGGER.warning('Stored plan payload is invalid JSON', extra={'permit_id': permit_id, 'workspace_type': workspace_type})
            return None

    def set_status(self, permit_id: str, status: str) -> None:
        """Persist the latest workspace status."""

        key = self._status_key(permit_id)
        LOGGER.debug("Setting workspace status", extra={"permit_id": permit_id, "status": status})
        self._redis.set(key, status)
        history_key = self._history_key(permit_id)
        history_entry = json.dumps({"status": status, "timestamp": datetime.utcnow().isoformat()})
        self._redis.lpush(history_key, history_entry)

    def get_status(self, permit_id: str) -> Optional[str]:
        """Return the current status for the permit, if any."""

        value = self._redis.get(self._status_key(permit_id))
        LOGGER.debug("Fetched workspace status", extra={"permit_id": permit_id, "status": value})
        return value

    def set_connection_details(self, permit_id: str, connection: Dict[str, Any]) -> None:
        """Persist connection metadata for an active workspace."""

        key = self._connection_key(permit_id)
        LOGGER.debug(
            "Saving connection details", extra={"permit_id": permit_id, "connection": connection}
        )
        self._redis.set(key, json.dumps(connection))

    def get_connection_details(self, permit_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve connection metadata for the permit."""

        raw = self._redis.get(self._connection_key(permit_id))
        if not raw:
            LOGGER.debug("No connection details found", extra={"permit_id": permit_id})
            return None
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            LOGGER.warning(
                "Connection details stored in Redis are invalid JSON", extra={"permit_id": permit_id}
            )
            return None
        LOGGER.debug("Loaded connection details", extra={"permit_id": permit_id, "payload": payload})
        return payload

    def clear_permit(self, permit_id: str) -> None:
        """Remove all cached state related to a permit."""

        keys = [
            self._status_key(permit_id),
            self._connection_key(permit_id),
            self._history_key(permit_id),
        ]
        plan_pattern = self.PLAN_KEY_TEMPLATE.format(permit_id=permit_id, workspace_type="*")
        plan_keys = list(self._redis.scan_iter(plan_pattern))
        keys.extend(plan_keys)
        LOGGER.debug("Clearing Redis keys", extra={"permit_id": permit_id, "keys": keys})
        if keys:
            self._redis.delete(*keys)


__all__ = ["WorkspaceStateManager"]
