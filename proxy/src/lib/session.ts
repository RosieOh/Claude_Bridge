import type { Session } from "@prisma/client";
import { prisma } from "../db.js";

const DEFAULT_SESSION_ID = "default";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TOKEN_LIMIT = 200_000;

export interface GetOrCreateSessionOptions {
  name?: string;
  model?: string;
}

export async function getOrCreateSession(
  sessionId: string | null,
  options: GetOrCreateSessionOptions = {}
): Promise<Session> {
  const effectiveId = sessionId?.trim() || DEFAULT_SESSION_ID;
  const model = options.model || DEFAULT_MODEL;

  let session = await prisma.session.findUnique({ where: { id: effectiveId } });

  if (session) {
    if (options.model && options.model !== session.model) {
      session = await prisma.session.update({
        where: { id: effectiveId },
        data: { model: options.model, updatedAt: new Date() },
      });
    }
    return session;
  }

  session = await prisma.session.create({
    data: {
      id: effectiveId,
      name: options.name ?? (effectiveId === DEFAULT_SESSION_ID ? "Default" : null),
      model,
      tokenLimit: DEFAULT_TOKEN_LIMIT,
    },
  });
  return session;
}

export function computeSessionStatus(tokenUsed: number, tokenLimit: number): "ok" | "warn" | "critical" {
  if (tokenLimit <= 0) return "ok";
  const pct = (tokenUsed / tokenLimit) * 100;
  if (pct >= 90) return "critical";
  if (pct >= 70) return "warn";
  return "ok";
}
