import "dotenv/config";
import Fastify from "fastify";
import { prisma } from "./db.js";
import { proxyRoutes } from "./routes/proxy.js";
import { internalRoutes } from "./routes/internal.js";

const PORT = Number(process.env.PORT) || 37891;

async function main() {
  const fastify = Fastify({ logger: true });
  fastify.decorate("prisma", prisma);

  await fastify.register(proxyRoutes, { prefix: "/v1" });
  await fastify.register(internalRoutes, { prefix: "/internal" });

  fastify.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });

  try {
    await fastify.listen({ port: PORT, host: "127.0.0.1" });
    console.log(`CSM Proxy listening on http://127.0.0.1:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
