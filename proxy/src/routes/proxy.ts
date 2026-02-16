import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function proxyRoutes(fastify: FastifyInstance) {
  fastify.post("/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!API_KEY) {
      return reply.status(503).send({
        error: "CSM proxy not configured",
        code: "MISSING_API_KEY",
      });
    }

    const sessionId = (request.headers["x-csm-session-id"] as string) || null;
    const tags = (request.headers["x-csm-tags"] as string) || null;
    const body = request.body as Record<string, unknown>;

    try {
      const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return reply.status(res.status).send(data);
      }

      // TODO Phase 1: persist session/request/messages, compute tokens from data.usage
      // if (sessionId) { ... }

      return reply.status(res.status).send(data);
    } catch (err) {
      fastify.log.error(err);
      return reply.status(502).send({
        error: "Upstream request failed",
        code: "PROXY_ERROR",
      });
    }
  });
}
