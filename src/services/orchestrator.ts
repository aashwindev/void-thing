import { randomUUID } from "node:crypto";
import type { ActionRequest, ExecuteResult, ProviderName, RunStep, ToolName } from "../domain/types.js";
import { AppError } from "../utils/error.js";
import { nowIso } from "../utils/time.js";
import type { ProviderAdapter } from "../providers/base.js";
import { evaluatePolicies } from "./policy.js";
import { InMemoryStore } from "./store.js";

const toolDefaultProvider: Record<ToolName, Exclude<ProviderName, "auto"> | null> = {
  deploy_preview: "vercel",
  provision_db: "supabase",
  run_migration: "supabase",
  set_env_var: "vercel",
  attach_domain: "cloudflare",
  create_dns_record: "cloudflare",
  rollback_run: null,
  list_connections: null
};

const destructiveInProd = new Set<ToolName>(["run_migration", "attach_domain", "create_dns_record", "rollback_run"]);

export class Orchestrator {
  public constructor(
    private readonly store: InMemoryStore,
    private readonly adapterRegistry: Record<string, ProviderAdapter>
  ) {}

  public async execute(request: ActionRequest): Promise<ExecuteResult> {
    if (request.idempotency_key) {
      const existing = this.store.getRunByIdempotency(request.project_id, request.tool, request.idempotency_key);
      if (existing) {
        return { run: existing, steps: this.store.getRunSteps(existing.id) };
      }
    }

    if (request.tool === "list_connections") {
      const run = this.store.createRun(request);
      const output = this.store.getProjectConnections(request.project_id);
      const finalRun = this.store.updateRun(run.id, {
        status: "succeeded",
        output_json: output,
        started_at: nowIso(),
        finished_at: nowIso()
      });
      return { run: finalRun, steps: [] };
    }

    const decision = evaluatePolicies(request, this.store.policies);
    if (decision.effect === "deny") {
      throw new AppError("POLICY_DENIED", decision.reason ?? "Action denied", 403, false, {
        policy_id: decision.policy?.id
      });
    }

    const run = this.store.createRun(request);
    this.store.updateRun(run.id, {
      status: "in_progress",
      started_at: nowIso()
    });

    if (decision.effect === "require_approval" || (request.environment === "prod" && destructiveInProd.has(request.tool))) {
      const approval = this.store.createApproval(run.id, decision.reason ?? "Approval required for prod action", request.requested_by.user_id);
      const waitingRun = this.store.updateRun(run.id, { status: "waiting_approval" });
      return { run: waitingRun, steps: [], approval };
    }

    return this.executeRun(run.id);
  }

  public async executeRun(runId: string): Promise<ExecuteResult> {
    const run = this.store.runs.get(runId);
    if (!run) {
      throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
    }

    const request = run.request_json;
    if (request.tool === "rollback_run") {
      const targetRunId = String(request.params?.target_run_id ?? "");
      const targetSteps = this.store.getRunSteps(targetRunId);
      if (!targetRunId || targetSteps.length === 0) {
        throw new AppError("ROLLBACK_TARGET_INVALID", "Rollback target run is missing or has no steps", 400);
      }

      const rollbackSteps: RunStep[] = targetSteps.map((step, index) => ({
        id: randomUUID(),
        run_id: run.id,
        step_order: index + 1,
        provider: step.provider,
        action: String(step.rollback_json?.action ?? `rollback_${step.action}`),
        status: "succeeded",
        input_json: (step.rollback_json?.params as Record<string, unknown>) ?? {},
        output_json: { rolled_back_step_id: step.id },
        rollback_json: null,
        started_at: nowIso(),
        finished_at: nowIso()
      }));

      this.store.setRunSteps(run.id, rollbackSteps);
      const finalRun = this.store.updateRun(run.id, {
        status: "rolled_back",
        output_json: { target_run_id: targetRunId, rollback_count: rollbackSteps.length },
        finished_at: nowIso()
      });
      return { run: finalRun, steps: rollbackSteps };
    }

    const provider = this.resolveProvider(request.tool, request.provider);
    const connection = this.resolveConnection(request.project_id, request.environment, provider);

    const step: RunStep = {
      id: randomUUID(),
      run_id: run.id,
      step_order: 1,
      provider,
      action: request.tool,
      status: "in_progress",
      input_json: request.params ?? {},
      output_json: {},
      rollback_json: null,
      started_at: nowIso()
    };

    this.store.setRunSteps(run.id, [step]);
    const adapter = this.adapterRegistry[provider];
    if (!adapter) {
      throw new AppError("ADAPTER_NOT_FOUND", `No adapter registered for provider ${provider}`, 500);
    }

    const adapterResult = await adapter.execute({
      action: request.tool,
      params: request.params ?? {},
      connection,
      dryRun: Boolean(request.dry_run)
    });

    this.store.updateStep(run.id, step.id, {
      status: adapterResult.status === "failed" ? "failed" : "succeeded",
      output_json: adapterResult.output,
      rollback_json: adapterResult.rollback?.[0] ?? null,
      finished_at: nowIso()
    });

    const finalStatus = adapterResult.status === "failed" ? "failed" : "succeeded";
    const finalRun = this.store.updateRun(run.id, {
      status: finalStatus,
      provider,
      output_json: {
        run_id: run.id,
        provider,
        provider_action_id: adapterResult.provider_action_id,
        ...adapterResult.output
      },
      error_json: finalStatus === "failed" ? { message: "Provider execution failed" } : undefined,
      finished_at: nowIso()
    });

    this.store.appendAudit({
      org_id: finalRun.org_id,
      run_id: finalRun.id,
      actor_type: "system",
      actor_id: "orchestrator",
      event_type: `run.${finalStatus}`,
      payload: { provider }
    });

    return { run: finalRun, steps: this.store.getRunSteps(run.id) };
  }

  public approveAndContinue(approvalId: string, decidedBy: string, decision: "approved" | "rejected"): ExecuteResult {
    const approval = this.store.decideApproval(approvalId, decision, decidedBy);
    const run = this.store.runs.get(approval.run_id);
    if (!run) {
      throw new AppError("RUN_NOT_FOUND", "Run not found for approval", 404);
    }

    if (decision === "rejected") {
      const rejectedRun = this.store.updateRun(run.id, {
        status: "failed",
        error_json: { message: "Approval rejected", approval_id: approvalId },
        finished_at: nowIso()
      });
      return { run: rejectedRun, steps: this.store.getRunSteps(run.id), approval };
    }

    this.store.updateRun(run.id, { status: "in_progress" });
    return {
      ...{
        run: this.store.runs.get(run.id)!,
        steps: this.store.getRunSteps(run.id),
        approval
      }
    };
  }

  private resolveProvider(tool: ToolName, provider?: ProviderName): Exclude<ProviderName, "auto"> {
    if (provider && provider !== "auto") {
      return provider;
    }
    const defaultProvider = toolDefaultProvider[tool];
    if (!defaultProvider) {
      throw new AppError("PROVIDER_REQUIRED", `Provider is required for tool ${tool}`, 400);
    }
    return defaultProvider;
  }

  private resolveConnection(projectId: string, env: string, provider: Exclude<ProviderName, "auto">) {
    const binding = this.store.bindings.find(
      (item) => item.project_id === projectId && item.environment === env && item.provider === provider
    );
    const fallback = this.store.bindings.find((item) => item.project_id === projectId && item.provider === provider);
    const selected = binding ?? fallback;
    if (!selected) {
      throw new AppError("CONNECTION_NOT_FOUND", `No project binding found for ${provider} in ${env}`, 404);
    }
    const connection = this.store.connections.get(selected.connection_id);
    if (!connection || connection.status !== "active") {
      throw new AppError("CONNECTION_UNAVAILABLE", `Connection not active for ${provider}`, 400);
    }
    return connection;
  }
}
