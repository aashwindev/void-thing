import type { FastifyInstance } from "fastify";

export const registerIntegrationRoutes = (app: FastifyInstance): void => {
  app.post("/v1/oauth/:provider/start", async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;
    return reply.status(200).send({
      provider,
      auth_url: `https://example.com/oauth/${provider}/authorize`,
      state: "demo-state"
    });
  });

  app.get("/v1/oauth/:provider/callback", async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;
    return reply.status(200).send({
      provider,
      status: "connected",
      connection_id: `conn-${provider}-new`
    });
  });

  app.post("/v1/webhooks/:provider", async (request, reply) => {
    const provider = (request.params as { provider: string }).provider;
    app.ctx.store.appendAudit({
      org_id: "org-demo",
      actor_type: "provider_webhook",
      actor_id: provider,
      event_type: "webhook.received",
      payload: { body: request.body as Record<string, unknown> }
    });
    return reply.status(202).send({ ok: true });
  });
};
