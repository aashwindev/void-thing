import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { approvalResponseSchema } from "../domain/schemas.js";
import { AppError, toErrorPayload } from "../utils/error.js";

const approvalParams = z.object({ approvalId: z.string().uuid() });

export const registerApprovalRoutes = (app: FastifyInstance): void => {
  app.post("/v1/approvals/:approvalId/respond", async (request, reply) => {
    try {
      const { approvalId } = approvalParams.parse(request.params);
      const body = approvalResponseSchema.parse(request.body);
      const approval = app.ctx.store.approvals.get(approvalId);
      if (!approval) {
        throw new AppError("APPROVAL_NOT_FOUND", "Approval not found", 404);
      }

      const initial = app.ctx.orchestrator.approveAndContinue(approvalId, body.decided_by, body.decision);
      if (body.decision === "approved") {
        const executed = await app.ctx.orchestrator.executeRun(initial.run.id);
        return reply.status(200).send({ ...executed, approval: initial.approval });
      }

      return reply.status(200).send(initial);
    } catch (error) {
      const payload = toErrorPayload(error);
      return reply.status(payload.statusCode).send(payload.body);
    }
  });
};
