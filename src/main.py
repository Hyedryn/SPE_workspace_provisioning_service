"""Application entrypoint for the Workspace Provisioning Service."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import redis
from fastapi import FastAPI

from .api.routes import router as api_router
from .config import AppConfig, get_settings
from .events.consumer import EventConsumer
from .events.publisher import AuditEventPublisher, RabbitMQPublisher
from .orchestration.main import WorkspaceOrchestrator
from .services.state_manager import WorkspaceStateManager

LOGGER = logging.getLogger(__name__)


@asynccontextmanager
def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: AppConfig = app.state.settings
    event_consumer: EventConsumer = app.state.event_consumer
    redis_client = app.state.redis
    LOGGER.info("Starting Workspace Provisioning Service", extra={"service": settings.service_name})
    event_consumer.start()
    yield
    LOGGER.info("Shutting down Workspace Provisioning Service")
    event_consumer.stop()
    redis_client.close()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""

    settings = get_settings()
    logging.basicConfig(level=settings.logging.level, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    redis_client = redis.from_url(settings.redis.url, decode_responses=settings.redis.decode_responses)
    state_manager = WorkspaceStateManager(redis_client)
    event_publisher = RabbitMQPublisher(settings)
    audit_publisher = AuditEventPublisher(event_publisher)
    orchestrator = WorkspaceOrchestrator(settings, state_manager, event_publisher, audit_publisher)
    event_consumer = EventConsumer(settings, orchestrator.handle_event)

    app = FastAPI(
        title="Workspace Provisioning Service",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.include_router(api_router, prefix=settings.api_prefix)

    app.state.settings = settings
    app.state.redis = redis_client
    app.state.state_manager = state_manager
    app.state.orchestrator = orchestrator
    app.state.event_publisher = event_publisher
    app.state.audit_publisher = audit_publisher
    app.state.event_consumer = event_consumer

    return app


app = create_app()


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=False)
