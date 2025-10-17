# Workspace Provisioning Service

The Workspace Provisioning Service (WPS) is responsible for orchestrating the lifecycle of secure compute environments across the Secure Processing Environment (SPE) platform. It listens for permit workflow events, provisions Kubernetes-based workspaces via Pulumi Automation API, and exposes an internal API for querying workspace status and connection information.

## Features

- Event-driven orchestration powered by RabbitMQ consumers.
- Pulumi Automation API integration to provision Kubernetes pods, persistent storage, and network policies per workspace stage.
- Redis-backed state manager for workspace status and connection metadata.
- FastAPI application exposing REST endpoints for the Permit Manager and other backend services.
- Configurable via environment variables using Pydantic settings.

## Project Structure

```
src/
├── api/                    # FastAPI routers
├── config.py               # Central configuration definitions
├── events/                 # RabbitMQ consumer and domain models
├── orchestration/          # Pulumi orchestration logic
├── services/               # Redis-backed services
└── main.py                 # Application factory and ASGI entrypoint
```

## Configuration

Configuration is provided through environment variables prefixed with `WPS_`. A `.env` file may also be used for local development. The most important variables include:

| Variable | Description |
| --- | --- |
| `WPS_RABBITMQ__URL` | AMQP connection URL for RabbitMQ. |
| `WPS_RABBITMQ__QUEUE` | Queue name to consume events from. |
| `WPS_REDIS__URL` | Redis connection URL. |
| `WPS_PULUMI__PROJECT_NAME` | Pulumi project name. |
| `WPS_PULUMI__STACK_PREFIX` | Prefix applied to all generated stack names. |
| `WPS_DISABLE_PULUMI` | Set to `true` to skip Pulumi execution (local dry-run). |

Refer to `src/config.py` for the full list of settings.

## Running Locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export WPS_RABBITMQ__URL=amqp://guest:guest@localhost:5672/
export WPS_RABBITMQ__QUEUE=spe.workspace.events
export WPS_REDIS__URL=redis://localhost:6379/0
export WPS_PULUMI__PROJECT_NAME=spe-workspace
uvicorn src.main:app --reload
```

## Why Redis?

The service must preserve runtime workspace details—such as connection credentials and the latest lifecycle state—so that other
backend services can retrieve them even if the provisioning service restarts. The [initial blueprint](initial_blueprint.md)
specifies Redis for this purpose because it offers fast, ephemeral storage without the operational overhead of a relational
database. The FastAPI endpoints (`/status` and `/connection`) and the orchestration layer both rely on the
`WorkspaceStateManager` to read and write these values. Removing Redis would mean the information is lost on process restarts,
breaking the contract with the Permit Manager and Guacamole integrations.

## Docker

Build and run the container locally:

```bash
docker build -t spe-workspace-provisioning-service .
docker run \
  -e WPS_RABBITMQ__URL=amqp://guest:guest@rabbitmq:5672/ \
  -e WPS_RABBITMQ__QUEUE=spe.workspace.events \
  -e WPS_REDIS__URL=redis://redis:6379/0 \
  -e WPS_PULUMI__PROJECT_NAME=spe-workspace \
  -p 8000:8000 \
  spe-workspace-provisioning-service
```

## Internal API

- `GET /api/v1/workspaces/{permitId}/status` → Returns the current runtime status for a permit workspace.
- `GET /api/v1/workspaces/{permitId}/connection` → Returns connection details for Guacamole or other remote access services.

## Testing the API

```bash
curl http://localhost:8000/api/v1/workspaces/permit-123/status
```

## Observability

The application uses Python's standard logging facilities. Configure log level via `WPS_LOGGING__LEVEL` (defaults to `INFO`). Logs include contextual metadata about permit IDs and events to support centralized auditing.

## Notes

- The Pulumi Automation API requires appropriate cloud and Kubernetes credentials to be available in the execution environment.
- When `WPS_DISABLE_PULUMI=true`, the service will skip infrastructure operations while still updating Redis state. This mode is useful for local development and integration testing.
