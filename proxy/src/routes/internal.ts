import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { runSummarization } from "../lib/summary.js";

const API_KEY = process.env.ANTHROPIC_API_KEY;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function internalRoutes(fastify: FastifyInstance) {
  const prisma: PrismaClient = fastify.prisma;

  fastify.get("/health", async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: "ok" });
  });

  fastify.get("/usage", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query as { from?: string; to?: string }) || {};
    const from = q.from ? new Date(q.from) : startOfToday();
    const to = q.to ? new Date(q.to) : new Date();
    const requests = await prisma.request.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { inputTokens: true, outputTokens: true, cost: true, sessionId: true, createdAt: true },
    });
    const totalTokens = requests.reduce((acc, r) => acc + r.inputTokens + r.outputTokens, 0);
    const totalCost = requests.reduce((acc, r) => acc + r.cost, 0);
    return reply.send({
      from: from.toISOString(),
      to: to.toISOString(),
      totalTokens,
      totalCost,
      requestCount: requests.length,
    });
  });

  fastify.get("/status", async (_request: FastifyRequest, reply: FastifyReply) => {
    const todayStart = startOfToday();

    const [currentSession, todayAgg] = await Promise.all([
      prisma.session.findFirst({
        orderBy: { updatedAt: "desc" },
        take: 1,
      }),
      prisma.request.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { cost: true },
        _count: { id: true },
      }),
    ]);

    const todayTokensResult = await prisma.request.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { inputTokens: true, outputTokens: true },
    });
    const todayTokens = todayTokensResult.reduce(
      (acc, r) => acc + r.inputTokens + r.outputTokens,
      0
    );
    const todayCost = todayAgg._sum.cost ?? 0;

    const tokens = currentSession
      ? currentSession.tokenUsedInput + currentSession.tokenUsedOutput
      : 0;
    const limit = currentSession?.tokenLimit ?? 0;
    const warning =
      currentSession?.status === "critical"
        ? "Context limit critical (≥90%)"
        : currentSession?.status === "warn"
          ? "Context limit warning (≥70%)"
          : null;

    return reply.send({
      proxy: "on",
      currentSession: currentSession
        ? { id: currentSession.id, tokens, limit, model: currentSession.model }
        : null,
      todayTokens,
      todayCost,
      model: currentSession?.model ?? null,
      warning,
      apiKeyConfigured: !!API_KEY,
      recentErrors: [],
    });
  });

  fastify.get("/sessions", async (request: FastifyRequest, reply: FastifyReply) => {
    const q = (request.query as { range?: string; limit?: string }) || {};
    const range = q.range === "today" ? "today" : "all";
    const limit = Math.min(Math.max(parseInt(q.limit ?? "10", 10) || 10, 1), 100);
    const todayStart = range === "today" ? startOfToday() : undefined;

    const sessions = await prisma.session.findMany({
      where:
        range === "today"
          ? { OR: [{ createdAt: { gte: todayStart } }, { updatedAt: { gte: todayStart } }] }
          : undefined,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return reply.send({
      sessions: sessions.map((s) => ({
        id: s.id,
        name: s.name,
        model: s.model,
        tokenLimit: s.tokenLimit,
        tokenUsedInput: s.tokenUsedInput,
        tokenUsedOutput: s.tokenUsedOutput,
        tokenUsed: s.tokenUsedInput + s.tokenUsedOutput,
        costEstimated: s.costEstimated,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    });
  });

  fastify.get("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        summaries: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!session) {
      return reply.status(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }
    return reply.send({
      session: {
        id: session.id,
        name: session.name,
        model: session.model,
        tokenLimit: session.tokenLimit,
        tokenUsedInput: session.tokenUsedInput,
        tokenUsedOutput: session.tokenUsedOutput,
        costEstimated: session.costEstimated,
        status: session.status,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      messages: session.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        tokenCountEst: m.tokenCountEst,
        pinned: m.pinned,
        createdAt: m.createdAt.toISOString(),
      })),
      summaries: session.summaries.map((s) => ({
        id: s.id,
        version: s.version,
        summaryText: s.summaryText,
        tokenCount: s.tokenCount,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  });

  fastify.delete("/sessions/:id", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) {
      return reply.status(404).send({ error: "Session not found", code: "NOT_FOUND" });
    }
    await prisma.session.delete({ where: { id } });
    return reply.send({ ok: true, deletedId: id });
  });

  fastify.post("/sessions/new", async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { name?: string; model?: string }) || {};
    const newSession = await prisma.session.create({
      data: {
        name: body.name ?? "New Session",
        model: body.model ?? "claude-sonnet-4-20250514",
        tokenLimit: 200_000,
      },
    });
    return reply.send({
      session: { id: newSession.id, name: newSession.name, model: newSession.model },
    });
  });

  fastify.post("/sessions/:id/summarize", async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const exists = await prisma.session.findUnique({ where: { id } });
    if (!exists) return reply.status(404).send({ error: "Session not found", code: "NOT_FOUND" });
    if (!API_KEY) {
      return reply.status(503).send({ error: "API key not configured", code: "MISSING_API_KEY" });
    }
    try {
      const result = await runSummarization(prisma, id);
      return reply.send({
        ok: true,
        sessionId: id,
        summaryId: result.summaryId,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (e) {
      fastify.log.error(e);
      return reply.status(500).send({
        error: e instanceof Error ? e.message : "Summarization failed",
        code: "SUMMARY_ERROR",
      });
    }
  });

  fastify.patch(
    "/sessions/:id/messages/:msgId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id: sessionId, msgId } = request.params as { id: string; msgId: string };
      const body = (request.body as { pinned?: boolean }) || {};
      const pinned = body.pinned === true;
      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) {
        return reply.status(404).send({ error: "Session not found", code: "NOT_FOUND" });
      }
      const msg = await prisma.message.findFirst({
        where: { id: msgId, sessionId },
      });
      if (!msg) {
        return reply.status(404).send({ error: "Message not found", code: "NOT_FOUND" });
      }
      await prisma.message.update({
        where: { id: msgId },
        data: { pinned },
      });
      return reply.send({ ok: true, messageId: msgId, pinned });
    }
  );
}
