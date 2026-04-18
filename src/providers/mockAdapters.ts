import { randomUUID } from "node:crypto";
import type { AdapterExecuteInput, AdapterResult, ProviderAdapter } from "./base.js";

class BaseMockAdapter implements ProviderAdapter {
  public constructor(public readonly provider: ProviderAdapter["provider"], private readonly actions: string[]) {}

  public capabilities(): string[] {
    return this.actions;
  }

  public async execute(input: AdapterExecuteInput): Promise<AdapterResult> {
    const status: AdapterResult["status"] = input.dryRun ? "succeeded" : "succeeded";
    return {
      provider_action_id: `${this.provider}-${randomUUID()}`,
      status,
      output: {
        provider: this.provider,
        action: input.action,
        dry_run: Boolean(input.dryRun),
        target_connection: input.connection.id,
        echo: input.params
      },
      rollback: [
        {
          action: `rollback_${input.action}`,
          params: { ref: randomUUID() }
        }
      ]
    };
  }
}

export const adapters: Record<string, ProviderAdapter> = {
  vercel: new BaseMockAdapter("vercel", ["deploy_preview", "set_env_var", "attach_domain"]),
  netlify: new BaseMockAdapter("netlify", ["deploy_preview", "set_env_var", "attach_domain"]),
  supabase: new BaseMockAdapter("supabase", ["provision_db", "run_migration", "set_env_var"]),
  cloudflare: new BaseMockAdapter("cloudflare", ["create_dns_record", "attach_domain"]),
  aws: new BaseMockAdapter("aws", ["create_dns_record"]),
  github: new BaseMockAdapter("github", ["deploy_preview"])
};
