import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { toErrorPayload, AppError } from "../utils/error.js";

const runParams = z.object({ runId: z.string().uuid() });

export const registerRunRoutes = (app: FastifyInstance): void => {
  app.get("/v1/runs/:runId", async (request, reply) => {
    try {
      const { runId } = runParams.parse(request.params);
      const run = app.ctx.store.runs.get(runId);
      if (!run) {
        throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
      }
      return reply.status(200).send(run);
    } catch (error) {
      const payload = toErrorPayload(error);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });

  app.get("/v1/runs/:runId/steps", async (request, reply) => {
    try {
      const { runId } = runParams.parse(request.params);
      const run = app.ctx.store.runs.get(runId);
      if (!run) {
        throw new AppError("RUN_NOT_FOUND", "Run not found", 404);
      }
      return reply.status(200).send({ run_id: runId, steps: app.ctx.store.getRunSteps(runId) });
    } catch (error) {
      const payload = toErrorPayload(error);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });
};
