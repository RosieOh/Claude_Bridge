import type { PrismaClient } from "@prisma/client";

const ANTHROPIC_BASE = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
const API_KEY = process.env.ANTHROPIC_API_KEY;

const SUMMARY_SYSTEM = `You are a conversation summarizer. Given a conversation transcript, produce a concise summary in Markdown that captures:
- Key facts and context
- Decisions made
- Requirements or constraints mentioned
- Open or unresolved questions
Keep the summary brief and structured. Do not include verbatim long quotes.`;

function buildSummaryUserPrompt(messages: { role: string; content: string | null }[]): string {
  const lines = messages
    .filter((m) => m.content)
    .map((m) => `**${m.role}**: ${(m.content ?? "").trim()}`)
    .join("\n\n");
  return `Summarize this conversation:\n\n${lines}`;
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

export async function runSummarization(
  prisma: PrismaClient,
  sessionId: string,
  options: { model?: string } = {}
): Promise<{ summaryId: string; inputTokens: number; outputTokens: number }> {
  if (!API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) {
    throw new Error("Session not found");
  }

  const messagesToSummarize = session.messages.filter(
    (m) => !m.pinned && m.content && m.content.length > 0
  );
  const pinnedCount = session.messages.filter((m) => m.pinned).length;
  if (messagesToSummarize.length === 0) {
    throw new Error("No messages to summarize (all pinned or empty)");
  }

  const model = options.model ?? session.model ?? "claude-sonnet-4-20250514";
  const promptMessages = messagesToSummarize.map((m) => ({ role: m.role, content: m.content }));
  let userContent = buildSummaryUserPrompt(promptMessages);
  if (pinnedCount > 0) {
    userContent = `${userContent}\n\n(Note: ${pinnedCount} pinned message(s) were excluded from this summary and are kept in full.)`;
  }

  const res = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user" as const, content: userContent }],
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: ClaudeUsage;
  };

  if (!res.ok) {
    throw new Error(data && typeof data === "object" ? JSON.stringify(data) : `HTTP ${res.status}`);
  }

  const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
  const summaryText = Array.isArray(data.content)
    ? (data.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("")
    : "";

  const lastMessageId = messagesToSummarize[messagesToSummarize.length - 1]?.id ?? null;

  const summary = await prisma.summary.create({
    data: {
      sessionId,
      version: 1,
      summaryText: summaryText || "(empty summary)",
      coveredUntilMessageId: lastMessageId,
      tokenCount: usage.output_tokens,
    },
  });

  await prisma.request.create({
    data: {
      sessionId,
      endpoint: "/v1/messages",
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cost: 0,
      requestMeta: JSON.stringify({ summary: true }),
      responseMeta: JSON.stringify({ summaryId: summary.id }),
    },
  });

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      tokenUsedInput: session.tokenUsedInput + usage.input_tokens,
      tokenUsedOutput: session.tokenUsedOutput + usage.output_tokens,
      updatedAt: new Date(),
    },
  });

  return {
    summaryId: summary.id,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
  };
}
