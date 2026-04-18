export type ToolName =
  | "deploy_preview"
  | "provision_db"
  | "run_migration"
  | "set_env_var"
  | "attach_domain"
  | "create_dns_record"
  | "rollback_run"
  | "list_connections";

export type ProviderName =
  | "vercel"
  | "netlify"
  | "supabase"
  | "cloudflare"
  | "aws"
  | "github"
  | "auto";

export type EnvironmentName = "dev" | "preview" | "staging" | "prod";

export type RunStatus =
  | "queued"
  | "in_progress"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "rolled_back";

export type StepStatus = "queued" | "in_progress" | "succeeded" | "failed" | "rolled_back";

export interface RequestedBy {
  user_id: string;
  agent_name: string;
  session_id?: string;
}

export interface ActionRequest {
  request_id: string;
  idempotency_key?: string;
  tool: ToolName;
  provider?: ProviderName;
  project_id: string;
  environment: EnvironmentName;
  dry_run?: boolean;
  requested_by: RequestedBy;
  params?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface RunStep {
  id: string;
  run_id: string;
  step_order: number;
  provider: ProviderName | null;
  action: string;
  status: StepStatus;
  input_json: Record<string, unknown>;
  output_json: Record<string, unknown>;
  rollback_json?: Record<string, unknown> | null;
  started_at?: string;
  finished_at?: string;
}

export interface RunRecord {
  id: string;
  org_id: string;
  project_id: string;
  tool: ToolName;
  provider?: ProviderName;
  environment: EnvironmentName;
  status: RunStatus;
  request_json: ActionRequest;
  output_json: Record<string, unknown>;
  error_json?: Record<string, unknown>;
  idempotency_key?: string;
  requested_by: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface ApprovalRecord {
  id: string;
  org_id: string;
  run_id: string;
  reason: string;
  required_roles: string[];
  status: "pending" | "approved" | "rejected" | "expired";
  requested_by: string;
  decided_by?: string;
  decided_at?: string;
  created_at: string;
}

export interface ServiceConnection {
  id: string;
  org_id: string;
  provider: Exclude<ProviderName, "auto">;
  account_label: string;
  scopes: string[];
  status: "active" | "revoked" | "error";
  credential_ref: string;
}

export interface ProjectConnectionBinding {
  id: string;
  project_id: string;
  environment: EnvironmentName;
  provider: Exclude<ProviderName, "auto">;
  connection_id: string;
  target_identifier?: string;
}

export interface PolicyRecord {
  id: string;
  org_id: string;
  name: string;
  effect: "allow" | "deny" | "require_approval";
  tool: ToolName;
  environment?: EnvironmentName;
  condition_json: Record<string, unknown>;
}

export interface AuditEvent {
  id: string;
  org_id: string;
  run_id?: string;
  actor_type: "user" | "agent" | "system" | "provider_webhook";
  actor_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ExecuteResult {
  run: RunRecord;
  steps: RunStep[];
  approval?: ApprovalRecord;
}
