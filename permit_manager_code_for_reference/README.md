# SPE Permit Manager Service

The SPE Permit Manager is a Fastify + TypeScript microservice that orchestrates the lifecycle of Secure Processing Environment permits. It exposes a role-aware REST API, persists state with PostgreSQL via Prisma, publishes workflow events to RabbitMQ, and stores workspace runtime state in Redis.

## Features

- Permit search and retrieval with double-blind redaction rules for anonymous reviewers
- Lifecycle orchestration including ingress, preparation, workspace setup, analysis, and egress reviews
- Team, HDAB staff, and data holder management with fine-grained authorization
- Workspace control endpoints (start, stop, submit-for-review, status, connection, browse)
- Output submission and review workflow with egress summary metadata
- Rich permit activity log with filtering and viewer-aware anonymisation
- RabbitMQ event publication for state changes and audit events

## Technology Stack

- Node.js 20 / TypeScript 5
- Fastify 4 with JSON Schema validation via `@sinclair/typebox`
- Prisma ORM targeting PostgreSQL
- Redis (optional) for workspace state cache
- RabbitMQ for pub/sub events

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- (Optional) Redis 7+ for workspace status persistence
- RabbitMQ if event publication is required

### Installation

```bash
npm install
npm run build
```

Generate the Prisma client after configuring `DATABASE_URL`:

```bash
npx prisma generate
```

### Environment Configuration

Copy `.env.example` and update values as required:

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `development` or `production` |
| `PORT` | HTTP port for the Fastify server |
| `LOG_LEVEL` | Pino log level (`info`, `debug`, etc.) |
| `DATABASE_URL` | PostgreSQL connection string |
| `API_GATEWAY_SECRET` | Shared secret used to verify gateway-issued JWTs |
| `RABBITMQ_URL` | RabbitMQ connection string (optional) |

### Running the Service

```bash
npm run dev # tsx watch mode
# or
npm start   # after npm run build
```

The API listens on `http://localhost:3001` by default and exposes `/health` for readiness checks.

### Docker

A multi-stage Dockerfile is provided:

```bash
docker build -t spe-permit-manager .
docker run --env-file .env -p 3001:3001 spe-permit-manager
```

Ensure that the container can reach PostgreSQL and RabbitMQ hosts referenced in the environment file.

## Development Notes

- Prisma schema is the source of truth for database models (`prisma/schema.prisma`).
- Generated Prisma client is emitted to `src/generated/prisma-client`.
- All mutating endpoints record an audit entry in `PermitActivityLog` and publish a related RabbitMQ event when `RABBITMQ_URL` is configured.
- Workspace status is cached in an in-memory store.
- Authorization is enforced using HMAC-SHA256 signed JWTs supplied via the `X-User-Info` gateway header. Tokens are verified with `API_GATEWAY_SECRET` before any request handlers execute.

## Testing

Automated tests are not included in this initial implementation. For manual verification, use REST clients (e.g., Insomnia/Postman) against the documented endpoints in `frontend_code_for_reference/src/mocks/handlers.js`.

## License

MIT
