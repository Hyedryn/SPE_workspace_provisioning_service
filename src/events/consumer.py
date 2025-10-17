"""RabbitMQ consumer for workspace provisioning events."""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Callable, Optional

import pika

from ..config import AppConfig
from .models import EventType, PermitEvent, PermitStatus

LOGGER = logging.getLogger(__name__)


class EventConsumer:
    """Background thread that consumes events from RabbitMQ."""

    def __init__(self, config: AppConfig, handler: Callable[[PermitEvent], None]) -> None:
        self._config = config
        self._handler = handler
        self._connection: Optional[pika.BlockingConnection] = None
        self._channel: Optional[pika.adapters.blocking_connection.BlockingChannel] = None
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        """Start the consumer in a daemon thread."""

        if self._thread and self._thread.is_alive():
            LOGGER.debug("Event consumer already running")
            return
        self._thread = threading.Thread(target=self._run, name="event-consumer", daemon=True)
        self._thread.start()
        LOGGER.info("Event consumer thread started")

    def stop(self) -> None:
        """Signal the consumer to stop and wait for termination."""

        self._stop_event.set()
        if self._connection and self._connection.is_open:
            self._connection.add_callback_threadsafe(self._connection.close)
        if self._thread:
            self._thread.join(timeout=5)
        LOGGER.info("Event consumer thread stopped")

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._connect()
                self._consume()
            except pika.exceptions.AMQPConnectionError as exc:
                LOGGER.error("RabbitMQ connection error", exc_info=exc)
                time.sleep(5)
            except Exception as exc:  # pragma: no cover - defensive
                LOGGER.exception("Unhandled exception in event consumer", exc_info=exc)
                time.sleep(5)
            finally:
                self._cleanup()

    def _connect(self) -> None:
        parameters = pika.URLParameters(self._config.rabbitmq.url)
        self._connection = pika.BlockingConnection(parameters)
        self._channel = self._connection.channel()
        self._channel.basic_qos(prefetch_count=self._config.rabbitmq.prefetch_count)
        self._channel.queue_declare(queue=self._config.rabbitmq.queue, durable=True)
        for binding in self._config.event_bindings:
            self._channel.queue_bind(
                queue=self._config.rabbitmq.queue,
                exchange="spe.events",
                routing_key=binding,
            )
        LOGGER.info("Connected to RabbitMQ", extra={"queue": self._config.rabbitmq.queue})

    def _consume(self) -> None:
        assert self._channel is not None
        for method, properties, body in self._channel.consume(self._config.rabbitmq.queue):
            if self._stop_event.is_set():
                break
            try:
                event = self._parse_event(body, properties.headers if properties else None)
                self._handler(event)
                self._channel.basic_ack(method.delivery_tag)
            except Exception as exc:  # pragma: no cover - ensures resilience
                LOGGER.exception("Failed to process event", exc_info=exc)
                self._channel.basic_nack(method.delivery_tag, requeue=False)

    def _cleanup(self) -> None:
        if self._channel and self._channel.is_open:
            self._channel.close()
        if self._connection and self._connection.is_open:
            self._connection.close()
        self._channel = None
        self._connection = None

    def _parse_event(self, body: bytes, headers: Optional[dict]) -> PermitEvent:
        payload = json.loads(body.decode("utf-8")) if body else {}
        event_type = payload.get("type") or (headers or {}).get("x-event-type")
        if not event_type:
            raise ValueError("Received message without event type")
        try:
            event_enum = EventType(event_type)
        except ValueError as exc:
            raise ValueError(f"Unsupported event type: {event_type}") from exc
        status = payload.get("status")
        permit_status = None
        if status:
            try:
                permit_status = PermitStatus(status)
            except ValueError:
                LOGGER.warning("Unknown permit status", extra={"status": status})
        permit_id = payload.get('permitId') or payload.get('permit_id')
        if not permit_id:
            raise ValueError('Event payload missing permitId')
        event = PermitEvent(
            type=event_enum,
            permit_id=str(permit_id),
            status=permit_status,
            payload=payload.get('data') or payload,
            message_id=(headers or {}).get('x-message-id'),
        )
        LOGGER.debug(
            "Parsed permit event",
            extra={"event_type": event.type, "permit_id": event.permit_id, "status": event.status},
        )
        return event


__all__ = ["EventConsumer"]
