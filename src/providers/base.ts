import type { ProviderName, ServiceConnection } from "../domain/types.js";

export interface AdapterResult {
  provider_action_id?: string;
  status: "queued" | "in_progress" | "succeeded" | "failed";
  output: Record<string, unknown>;
  rollback?: Array<{ action: string; params: Record<string, unknown> }>;
}

export interface AdapterExecuteInput {
  action: string;
  params: Record<string, unknown>;
  connection: ServiceConnection;
  dryRun?: boolean;
}

export interface ProviderAdapter {
  provider: Exclude<ProviderName, "auto">;
  capabilities(): string[];
  execute(input: AdapterExecuteInput): Promise<AdapterResult>;
}
