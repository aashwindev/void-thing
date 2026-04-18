import Fastify from "fastify";
import cors from "@fastify/cors";
import { adapters } from "./providers/mockAdapters.js";
import { registerActionRoutes } from "./routes/actions.js";
import { registerApprovalRoutes } from "./routes/approvals.js";
import { registerConnectionRoutes } from "./routes/connections.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerRunRoutes } from "./routes/runs.js";
import { Orchestrator } from "./services/orchestrator.js";
import { InMemoryStore } from "./services/store.js";

const buildServer = () => {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV !== "production"
          ? {
              target: "pino-pretty"
            }
          : undefined
    }
  });

  const store = new InMemoryStore();
  const orchestrator = new Orchestrator(store, adapters);

  app.decorate("ctx", { store, orchestrator });

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true, service: "agent-bridge-mcp" }));

  registerActionRoutes(app);
  registerRunRoutes(app);
  registerApprovalRoutes(app);
  registerConnectionRoutes(app);
  registerIntegrationRoutes(app);

  return app;
};

declare module "fastify" {
  interface FastifyInstance {
    ctx: {
      store: InMemoryStore;
      orchestrator: Orchestrator;
    };
  }
}

const app = buildServer();
const port = Number(process.env.PORT ?? "8787");

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`AgentBridge API listening on ${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
