"""Application configuration module."""
from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RabbitMQConfig(BaseModel):
    """Configuration options for RabbitMQ connections."""

    url: str = Field(..., description="AMQP URL for the RabbitMQ broker")
    queue: str = Field(..., description="Queue name to consume workspace events from")
    prefetch_count: int = Field(5, ge=1, le=50, description="Consumer prefetch count")


class RedisConfig(BaseModel):
    """Configuration for the Redis connection used for workspace state."""

    url: str = Field(..., description="Redis connection URL")
    decode_responses: bool = Field(True, description="Decode responses to str instead of bytes")


class PulumiConfig(BaseModel):
    """Pulumi Automation API configuration."""

    project_name: str = Field(..., description="Pulumi project name for workspace stacks")
    stack_prefix: str = Field("permit", description="Prefix for generated Pulumi stack names")
    organization: Optional[str] = Field(
        None,
        description=(
            "Optional Pulumi organization name. When provided, stacks will be scoped as"
            " '<org>/<project>/<stack>'."
        ),
    )
    work_dir: Optional[str] = Field(
        None,
        description=(
            "Optional working directory containing the Pulumi program. If omitted the"
            " embedded inline program is used."
        ),
    )
    refresh_before_update: bool = Field(
        True, description="Refresh stack state from the provider before updating"
    )

    @field_validator("stack_prefix")
    def _normalize_stack_prefix(cls, value: str) -> str:
        return value.replace(" ", "-").lower()


class LoggingConfig(BaseModel):
    """Simple logging configuration."""

    level: str = Field("INFO", description="Application log level")


class AppConfig(BaseSettings):
    """Top-level application configuration loaded from environment variables."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="WPS_", case_sensitive=False)

    rabbitmq: RabbitMQConfig
    redis: RedisConfig
    pulumi: PulumiConfig
    logging: LoggingConfig = Field(default_factory=LoggingConfig)
    api_prefix: str = Field("/api/v1", description="Base prefix for FastAPI routes")
    service_name: str = Field("workspace-provisioning-service", description="Service identifier")
    disable_pulumi: bool = Field(
        False,
        description="When true the Pulumi automation calls are skipped. Useful for local development.",
    )
    event_bindings: List[str] = Field(
        default_factory=lambda: [
            "permit.status.updated",
            "permit.ingress.initiated",
            "permit.workspace.stop_requested",
            "permit.workspace.start_requested",
            "permit.deleted",
        ],
        description="List of event routing keys the service will subscribe to.",
    )


@lru_cache
def get_settings() -> AppConfig:
    """Return a cached instance of the application settings."""

    return AppConfig()


__all__ = ["AppConfig", "RabbitMQConfig", "RedisConfig", "PulumiConfig", "LoggingConfig", "get_settings"]
