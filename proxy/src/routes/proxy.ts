import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getOrCreateSession, computeSessionStatus } from "../lib/session.js";
import { runSummarization } from "../lib/summary.js";
import type { PrismaClient } from "@prisma/client";

const AUTO_SUMMARY_THRESHOLD = 0.8; // trigger when usage >= 80%
const summarizingSessions = new Set<string>();

function maybeTriggerAutoSummary(
  prisma: PrismaClient,
  sessionId: string,
  totalUsed: number,
  tokenLimit: number,
  log: { error: (e: unknown) => void }
): void {
  if (tokenLimit <= 0 || totalUsed / tokenLimit < AUTO_SUMMARY_THRESHOLD) return;
  if (summarizingSessions.has(sessionId)) return;
  summarizingSessions.add(sessionId);
  runSummarization(prisma, sessionId)
    .catch((e) => log.error(e))
    .finally(() => {
      summarizingSessions.delete(sessionId);
    });
}

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const API_KEY = process.env.ANTHROPIC_API_KEY;

interface ClaudeMessage {
  role: "user" | "assistant" | "system";
  content: string | unknown[];
}
interface ClaudeResponse {
  id?: string;
  type?: string;
  role?: string;
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

function getModelFromBody(body: Record<string, unknown>): string {
  const m = body.model;
  return typeof m === "string" ? m : "claude-sonnet-4-20250514";
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && "text" in c && typeof (c as { text?: string }).text === "string" ? (c as { text: string }).text : ""))
      .join("");
  }
  return "";
}

export async function proxyRoutes(fastify: FastifyInstance) {
  const prisma: PrismaClient = fastify.prisma;

  fastify.post("/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!API_KEY) {
      return reply.status(503).send({
        error: "CSM proxy not configured",
        code: "MISSING_API_KEY",
      });
    }

    const sessionId = (request.headers["x-csm-session-id"] as string) || null;
    const body = request.body as Record<string, unknown>;
    const model = getModelFromBody(body);
    const startedAt = Date.now();

    let session;
    try {
      session = await getOrCreateSession(sessionId, { model });
    } catch (e) {
      fastify.log.error(e);
      return reply.status(500).send({ error: "Failed to get or create session", code: "SESSION_ERROR" });
    }

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

      const data = (await res.json().catch(() => ({}))) as ClaudeResponse;
      const latencyMs = Date.now() - startedAt;

      if (!res.ok) {
        return reply.status(res.status).send(data);
      }

      const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cost = 0; // Phase 1: optional unit price later

      await prisma.request.create({
        data: {
          sessionId: session.id,
          endpoint: "/v1/messages",
          inputTokens,
          outputTokens,
          cost,
          latencyMs,
          requestMeta: JSON.stringify({ model: body.model }),
          responseMeta: JSON.stringify({ id: data.id, stop_reason: data.stop_reason }),
        },
      });

      const newTokenUsedInput = session.tokenUsedInput + inputTokens;
      const newTokenUsedOutput = session.tokenUsedOutput + outputTokens;
      const totalUsed = newTokenUsedInput + newTokenUsedOutput;
      const status = computeSessionStatus(totalUsed, session.tokenLimit);

      await prisma.session.update({
        where: { id: session.id },
        data: {
          tokenUsedInput: newTokenUsedInput,
          tokenUsedOutput: newTokenUsedOutput,
          costEstimated: session.costEstimated + cost,
          status,
          updatedAt: new Date(),
        },
      });

      maybeTriggerAutoSummary(
        prisma,
        session.id,
        totalUsed,
        session.tokenLimit,
        fastify.log
      );

      const messages = (body.messages as ClaudeMessage[] | undefined) ?? [];
      const existingCount = await prisma.message.count({ where: { sessionId: session.id } });
      const toInsert = messages.slice(existingCount);
      for (const msg of toInsert) {
        const role = msg.role === "system" ? "system" : msg.role === "assistant" ? "assistant" : "user";
        const content = extractTextContent(msg.content);
        await prisma.message.create({
          data: {
            sessionId: session.id,
            role,
            content: content || null,
            tokenCountEst: 0,
          },
        });
      }

      const assistantText = Array.isArray(data.content)
        ? (data.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? "").join("")
        : "";
      await prisma.message.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: assistantText || null,
          tokenCountEst: outputTokens,
        },
      });

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
