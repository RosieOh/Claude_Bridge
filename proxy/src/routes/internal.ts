import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function internalRoutes(fastify: FastifyInstance) {
  fastify.get("/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    // Phase 1: read current session from DB; for Phase 0 return stub
    return reply.send({
      proxy: "on",
      currentSession: null,
      todayTokens: 0,
      todayCost: 0,
      model: null,
      warning: null,
      apiKeyConfigured: !!API_KEY,
      recentErrors: [],
    });
  });

  fastify.get("/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    const { range = "all", limit = "10" } = (request.query as { range?: string; limit?: string }) || {};
    // Phase 1: Prisma Session.findMany with range/limit
    return reply.send({ sessions: [] });
  });

  fastify.get("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    // Phase 1: Session + messages + summaries
    return reply.send({ session: null, messages: [], summaries: [] });
  });

  fastify.post("/sessions/new", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { name?: string; model?: string }) || {};
    // Phase 1: Prisma Session.create
    return reply.send({ session: { id: "stub", ...body } });
  });

  fastify.post("/sessions/:id/summarize", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    // Phase 2: trigger summarization
    return reply.send({ ok: true, sessionId: id });
  });
}
