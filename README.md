# Void Thing (AgentBridge MVP)

Connect once, execute anywhere.

This is a 2-hour MVP for an agent control plane that exposes normalized actions across providers (Vercel/Netlify/Supabase/Cloudflare/AWS/GitHub) via one API surface.

## What It Includes

- Canonical action execution endpoint: `POST /v1/actions/execute`
- Normalized tools:
  - `deploy_preview`
  - `provision_db`
  - `run_migration`
  - `set_env_var`
  - `attach_domain`
  - `create_dns_record`
  - `rollback_run`
  - `list_connections`
- Policy engine (`allow`, `deny`, `require_approval`)
- Approval workflow for risky/prod actions
- Idempotency support (`idempotency_key`)
- Run/step/audit tracking
- OAuth/webhook endpoint stubs for provider connection flows
- Full Postgres schema at [`db/schema.sql`](./db/schema.sql)

## Quick Start

```bash
npm install
npm run dev
```

Server runs on `http://localhost:8787`.

## Demo Flow

### 1) Check health

```bash
curl http://localhost:8787/health
```

### 2) List seeded connections

```bash
curl http://localhost:8787/v1/projects/project-demo/connections
```

### 3) Execute preview deploy

```bash
curl -X POST http://localhost:8787/v1/actions/execute \
  -H 'content-type: application/json' \
  -d '{
    "request_id":"req-1",
    "idempotency_key":"deploy-preview-req-1",
    "tool":"deploy_preview",
    "project_id":"project-demo",
    "environment":"preview",
    "requested_by":{"user_id":"user-1","agent_name":"claude-code"},
    "params":{"git_ref":"feature/agentbridge"}
  }'
```

### 4) Trigger prod migration (approval required)

```bash
curl -X POST http://localhost:8787/v1/actions/execute \
  -H 'content-type: application/json' \
  -d '{
    "request_id":"req-2",
    "tool":"run_migration",
    "project_id":"project-demo",
    "environment":"prod",
    "requested_by":{"user_id":"user-1","agent_name":"claude-code"},
    "params":{"migration_ref":"20260418_add_users","strategy":"safe"}
  }'
```

Take the returned `approval.id`, then:

```bash
curl -X POST http://localhost:8787/v1/approvals/<approval-id>/respond \
  -H 'content-type: application/json' \
  -d '{"decision":"approved","decided_by":"admin-1"}'
```

### 5) Run lookup

```bash
curl http://localhost:8787/v1/runs/<run-id>
curl http://localhost:8787/v1/runs/<run-id>/steps
```

## API Surface

- `POST /v1/actions/execute`
- `GET /v1/runs/:runId`
- `GET /v1/runs/:runId/steps`
- `POST /v1/approvals/:approvalId/respond`
- `GET /v1/projects/:projectId/connections`
- `POST /v1/oauth/:provider/start`
- `GET /v1/oauth/:provider/callback`
- `POST /v1/webhooks/:provider`

## Notes

- Current provider adapters are mock implementations so the full orchestration can be demoed instantly.
- Replace adapters in `src/providers/` with real SDK/API calls for production.
