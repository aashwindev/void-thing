import type { FastifyInstance } from "fastify";
import { actionRequestSchema } from "../domain/schemas.js";
import { toErrorPayload } from "../utils/error.js";

export const registerActionRoutes = (app: FastifyInstance): void => {
  app.post("/v1/actions/execute", async (request, reply) => {
    try {
      const parsed = actionRequestSchema.parse(request.body);
      const result = await app.ctx.orchestrator.execute(parsed);
      return reply.status(200).send(result);
    } catch (error) {
      const payload = toErrorPayload(error);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });
};
