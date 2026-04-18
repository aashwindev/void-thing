import { randomUUID } from "node:crypto";
import type {
  ActionRequest,
  ApprovalRecord,
  AuditEvent,
  ExecuteResult,
  PolicyRecord,
  ProjectConnectionBinding,
  RunRecord,
  RunStep,
  ServiceConnection,
  ToolName
} from "../domain/types.js";
import { nowIso } from "../utils/time.js";

const DEFAULT_ORG_ID = "org-demo";

export class InMemoryStore {
  public readonly runs = new Map<string, RunRecord>();
  public readonly runSteps = new Map<string, RunStep[]>();
  public readonly approvals = new Map<string, ApprovalRecord>();
  public readonly auditEvents = new Map<string, AuditEvent>();
  public readonly connections = new Map<string, ServiceConnection>();
  public readonly bindings: ProjectConnectionBinding[] = [];
  public readonly policies: PolicyRecord[] = [];
  private readonly idempotency = new Map<string, string>();

  public constructor() {
    this.seed();
  }

  public createRun(input: ActionRequest): RunRecord {
    const id = randomUUID();
    const createdAt = nowIso();
    const run: RunRecord = {
      id,
      org_id: DEFAULT_ORG_ID,
      project_id: input.project_id,
      tool: input.tool,
      provider: input.provider,
      environment: input.environment,
      status: "queued",
      request_json: input,
      output_json: {},
      idempotency_key: input.idempotency_key,
      requested_by: input.requested_by.user_id,
      created_at: createdAt
    };
    this.runs.set(id, run);
    if (input.idempotency_key) {
      this.idempotency.set(this.idempotencyKey(input.project_id, input.tool, input.idempotency_key), id);
    }
    this.appendAudit({
      org_id: run.org_id,
      run_id: id,
      actor_type: "agent",
      actor_id: input.requested_by.agent_name,
      event_type: "run.created",
      payload: { tool: input.tool, environment: input.environment }
    });
    return run;
  }

  public getRunByIdempotency(projectId: string, tool: ToolName, key: string): RunRecord | undefined {
    const runId = this.idempotency.get(this.idempotencyKey(projectId, tool, key));
    return runId ? this.runs.get(runId) : undefined;
  }

  public updateRun(runId: string, patch: Partial<RunRecord>): RunRecord {
    const current = this.runs.get(runId);
    if (!current) {
      throw new Error(`Run not found: ${runId}`);
    }
    const next: RunRecord = { ...current, ...patch };
    this.runs.set(runId, next);
    return next;
  }

  public setRunSteps(runId: string, steps: RunStep[]): void {
    this.runSteps.set(runId, steps);
  }

  public updateStep(runId: string, stepId: string, patch: Partial<RunStep>): RunStep {
    const steps = this.runSteps.get(runId) ?? [];
    const index = steps.findIndex((step) => step.id === stepId);
    if (index < 0) {
      throw new Error(`Step not found: ${stepId}`);
    }
    const current = steps[index];
    if (!current) {
      throw new Error(`Step index missing for: ${stepId}`);
    }
    const next: RunStep = { ...current, ...patch };
    steps[index] = next;
    this.runSteps.set(runId, steps);
    return next;
  }

  public getRunSteps(runId: string): RunStep[] {
    return this.runSteps.get(runId) ?? [];
  }

  public createApproval(runId: string, reason: string, requestedBy: string): ApprovalRecord {
    const approval: ApprovalRecord = {
      id: randomUUID(),
      org_id: DEFAULT_ORG_ID,
      run_id: runId,
      reason,
      required_roles: ["admin"],
      status: "pending",
      requested_by: requestedBy,
      created_at: nowIso()
    };
    this.approvals.set(approval.id, approval);
    this.appendAudit({
      org_id: DEFAULT_ORG_ID,
      run_id: runId,
      actor_type: "system",
      actor_id: "policy-engine",
      event_type: "approval.requested",
      payload: { reason }
    });
    return approval;
  }

  public decideApproval(approvalId: string, status: "approved" | "rejected", decidedBy: string): ApprovalRecord {
    const current = this.approvals.get(approvalId);
    if (!current) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    const next: ApprovalRecord = {
      ...current,
      status,
      decided_by: decidedBy,
      decided_at: nowIso()
    };
    this.approvals.set(approvalId, next);
    this.appendAudit({
      org_id: DEFAULT_ORG_ID,
      run_id: next.run_id,
      actor_type: "user",
      actor_id: decidedBy,
      event_type: `approval.${status}`,
      payload: {}
    });
    return next;
  }

  public appendAudit(input: Omit<AuditEvent, "id" | "created_at">): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      ...input,
      created_at: nowIso()
    };
    this.auditEvents.set(event.id, event);
    return event;
  }

  public getProjectConnections(projectId: string): ExecuteResult["run"]["output_json"] {
    const projectBindings = this.bindings.filter((binding) => binding.project_id === projectId);
    return {
      project_id: projectId,
      bindings: projectBindings.map((binding) => {
        const connection = this.connections.get(binding.connection_id);
        return {
          ...binding,
          connection: connection
            ? {
                id: connection.id,
                provider: connection.provider,
                account_label: connection.account_label,
                status: connection.status,
                scopes: connection.scopes
              }
            : null
        };
      })
    };
  }

  private idempotencyKey(projectId: string, tool: ToolName, key: string): string {
    return `${projectId}:${tool}:${key}`;
  }

  private seed(): void {
    const c1: ServiceConnection = {
      id: "conn-vercel-demo",
      org_id: DEFAULT_ORG_ID,
      provider: "vercel",
      account_label: "vercel-team-demo",
      scopes: ["deployments.write", "projects.read"],
      status: "active",
      credential_ref: "vault://conn-vercel-demo"
    };
    const c2: ServiceConnection = {
      id: "conn-supabase-demo",
      org_id: DEFAULT_ORG_ID,
      provider: "supabase",
      account_label: "supabase-org-demo",
      scopes: ["projects.write", "database.write"],
      status: "active",
      credential_ref: "vault://conn-supabase-demo"
    };
    const c3: ServiceConnection = {
      id: "conn-cloudflare-demo",
      org_id: DEFAULT_ORG_ID,
      provider: "cloudflare",
      account_label: "cloudflare-zone-demo",
      scopes: ["dns.write"],
      status: "active",
      credential_ref: "vault://conn-cloudflare-demo"
    };

    [c1, c2, c3].forEach((connection) => this.connections.set(connection.id, connection));

    this.bindings.push(
      {
        id: randomUUID(),
        project_id: "project-demo",
        environment: "preview",
        provider: "vercel",
        connection_id: c1.id,
        target_identifier: "vercel-project-demo"
      },
      {
        id: randomUUID(),
        project_id: "project-demo",
        environment: "preview",
        provider: "supabase",
        connection_id: c2.id,
        target_identifier: "supabase-project-demo"
      },
      {
        id: randomUUID(),
        project_id: "project-demo",
        environment: "prod",
        provider: "cloudflare",
        connection_id: c3.id,
        target_identifier: "example.com"
      }
    );

    this.policies.push(
      {
        id: randomUUID(),
        org_id: DEFAULT_ORG_ID,
        name: "Require approval for prod changes",
        effect: "require_approval",
        tool: "run_migration",
        environment: "prod",
        condition_json: {}
      },
      {
        id: randomUUID(),
        org_id: DEFAULT_ORG_ID,
        name: "Require approval for prod dns",
        effect: "require_approval",
        tool: "create_dns_record",
        environment: "prod",
        condition_json: {}
      },
      {
        id: randomUUID(),
        org_id: DEFAULT_ORG_ID,
        name: "Deny force migrations in prod",
        effect: "deny",
        tool: "run_migration",
        environment: "prod",
        condition_json: { strategy: "force" }
      }
    );
  }
}
