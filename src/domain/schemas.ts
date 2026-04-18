import { z } from "zod";

const providerSchema = z.enum(["vercel", "netlify", "supabase", "cloudflare", "aws", "github", "auto"]);
const environmentSchema = z.enum(["dev", "preview", "staging", "prod"]);
const toolSchema = z.enum([
  "deploy_preview",
  "provision_db",
  "run_migration",
  "set_env_var",
  "attach_domain",
  "create_dns_record",
  "rollback_run",
  "list_connections"
]);

export const actionRequestSchema = z.object({
  request_id: z.string().min(1),
  idempotency_key: z.string().min(1).optional(),
  tool: toolSchema,
  provider: providerSchema.optional(),
  project_id: z.string().min(1),
  environment: environmentSchema,
  dry_run: z.boolean().optional().default(false),
  requested_by: z.object({
    user_id: z.string().min(1),
    agent_name: z.string().min(1),
    session_id: z.string().optional()
  }),
  params: z.record(z.string(), z.unknown()).optional().default({}),
  meta: z.record(z.string(), z.unknown()).optional().default({})
});

export const approvalResponseSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  decided_by: z.string().min(1),
  note: z.string().optional()
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export type ActionRequestInput = z.infer<typeof actionRequestSchema>;
export type ApprovalResponseInput = z.infer<typeof approvalResponseSchema>;
