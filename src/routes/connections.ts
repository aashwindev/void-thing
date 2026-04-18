import type { FastifyInstance } from "fastify";
import { z } from "zod";

const paramsSchema = z.object({ projectId: z.string().min(1) });

export const registerConnectionRoutes = (app: FastifyInstance): void => {
  app.get("/v1/projects/:projectId/connections", async (request, reply) => {
    const { projectId } = paramsSchema.parse(request.params);
    return reply.status(200).send(app.ctx.store.getProjectConnections(projectId));
  });
};
