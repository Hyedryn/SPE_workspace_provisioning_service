"""RabbitMQ publishers for workspace domain and audit events."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import pika

from ..config import AppConfig

LOGGER = logging.getLogger(__name__)


class RabbitMQPublisher:
    """Utility for publishing JSON messages to the SPE events exchange."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._parameters = pika.URLParameters(config.rabbitmq.url)

    def publish(
        self,
        routing_key: str,
        payload: Dict[str, Any],
        headers: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Publish an event to the shared SPE exchange."""

        connection: Optional[pika.BlockingConnection] = None
        try:
            connection = pika.BlockingConnection(self._parameters)
            channel = connection.channel()
            channel.basic_publish(
                exchange="spe.events",
                routing_key=routing_key,
                body=json.dumps(payload).encode("utf-8"),
                properties=pika.BasicProperties(
                    content_type="application/json",
                    delivery_mode=2,
                    headers=headers or {},
                ),
            )
            LOGGER.debug(
                "Published event", extra={"routing_key": routing_key, "payload": payload}
            )
        except Exception:
            LOGGER.exception(
                "Failed to publish event", extra={"routing_key": routing_key, "payload": payload}
            )
            raise
        finally:
            if connection and connection.is_open:
                connection.close()


class AuditEventPublisher:
    """Publish structured audit events for centralized compliance logging."""

    def __init__(self, publisher: RabbitMQPublisher, routing_key: str = "audit.workspace.event") -> None:
        self._publisher = publisher
        self._routing_key = routing_key

    def publish(
        self,
        permit_id: str,
        action: str,
        outcome: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        event = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "permitId": permit_id,
            "action": action,
            "outcome": outcome,
            "details": details or {},
        }
        try:
            self._publisher.publish(self._routing_key, event)
        except Exception:
            LOGGER.exception(
                "Failed to publish audit event", extra={"permit_id": permit_id, "action": action}
            )


__all__ = ["RabbitMQPublisher", "AuditEventPublisher"]

