import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

const PROXY_BASE = import.meta.env.VITE_PROXY_URL ?? "http://127.0.0.1:37891";

interface Status {
  proxy: string;
  currentSession: { id: string; tokens: number; limit: number; model?: string } | null;
  todayTokens: number;
  todayCost: number;
  model: string | null;
  warning: string | null;
  apiKeyConfigured: boolean;
  recentErrors: string[];
}

interface SessionSummary {
  id: string;
  name: string | null;
  model: string;
  tokenLimit: number;
  tokenUsedInput: number;
  tokenUsedOutput: number;
  tokenUsed: number;
  costEstimated: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface MessageRow {
  id: string;
  role: string;
  content: string | null;
  tokenCountEst: number;
  pinned: boolean;
  createdAt: string;
}

interface SummaryRow {
  id: string;
  version: number;
  summaryText: string;
  tokenCount: number;
  createdAt: string;
}

interface SessionDetail {
  session: SessionSummary;
  messages: MessageRow[];
  summaries: SummaryRow[];
}

function formatTrayTooltip(status: Status): string {
  const parts = [
    `Today: ${status.todayTokens.toLocaleString()} tokens`,
    `$${status.todayCost.toFixed(2)}`,
  ];
  if (status.currentSession) {
    parts.push(
      `Session: ${status.currentSession.tokens.toLocaleString()}/${status.currentSession.limit.toLocaleString()}`
    );
  }
  if (status.warning) parts.push(`⚠ ${status.warning}`);
  return parts.join(" · ");
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [newSessionId, setNewSessionId] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState<string | null>(null);
  const [summarizeDone, setSummarizeDone] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${PROXY_BASE}/internal/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
      try {
        await invoke("set_tray_tooltip", { tooltip: formatTrayTooltip(data) });
      } catch {
        // not in Tauri or tray not ready
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch status");
      setStatus(null);
      try {
        await invoke("set_tray_tooltip", { tooltip: "CSM — Proxy unreachable" });
      } catch {
        // ignore
      }
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${PROXY_BASE}/internal/sessions?range=today&limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await fetchStatus();
      if (cancelled) return;
      await fetchSessions();
    };
    run();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchStatus, fetchSessions]);

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`${PROXY_BASE}/internal/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail(null);
    }
  };

  const createNewSession = async () => {
    try {
      const res = await fetch(`${PROXY_BASE}/internal/sessions/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Session" }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const id = data.session?.id;
      if (id) {
        setNewSessionId(id);
        await fetchSessions();
      }
    } catch {
      setNewSessionId(null);
    }
  };

  const summarizeSession = async (sessionId: string) => {
    setSummarizing(sessionId);
    setSummarizeDone(null);
    try {
      const res = await fetch(`${PROXY_BASE}/internal/sessions/${sessionId}/summarize`, {
        method: "POST",
      });
      if (res.ok) {
        setSummarizeDone(sessionId);
        if (detail?.session.id === sessionId) await openDetail(sessionId);
      }
    } finally {
      setSummarizing(null);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm("Delete this session? Messages and summaries will be removed.")) return;
    try {
      const res = await fetch(`${PROXY_BASE}/internal/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDetail(null);
        setSummarizeDone(null);
        await fetchSessions();
      }
    } catch {
      // ignore
    }
  };

  const togglePin = async (sessionId: string, msgId: string, pinned: boolean) => {
    try {
      const res = await fetch(
        `${PROXY_BASE}/internal/sessions/${sessionId}/messages/${msgId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        }
      );
      if (res.ok && detail?.session.id === sessionId) {
        setDetail((d) =>
          d
            ? {
                ...d,
                messages: d.messages.map((m) =>
                  m.id === msgId ? { ...m, pinned } : m
                ),
              }
            : null
        );
      }
    } catch {
      // ignore
    }
  };

  if (error && !status) {
    return (
      <div className="container">
        <h1>CSM</h1>
        <p className="error">
          Proxy not reachable. Start the proxy first (e.g. <code>npm run dev:proxy</code>).
        </p>
        <p className="muted">{error}</p>
        <button type="button" className="btn" onClick={() => { setError(null); fetchStatus(); }}>
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="container">
        <h1>CSM</h1>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>CSM — Claude Session Manager</h1>

      <section className="cards">
        <div className="card">
          <span className="card-label">Today Tokens</span>
          <span className="card-value">{status.todayTokens.toLocaleString()}</span>
        </div>
        <div className="card">
          <span className="card-label">Today Cost</span>
          <span className="card-value">${status.todayCost.toFixed(4)}</span>
        </div>
        <div className="card">
          <span className="card-label">Current Session</span>
          <span className="card-value">
            {status.currentSession
              ? `${status.currentSession.tokens.toLocaleString()} / ${status.currentSession.limit.toLocaleString()}`
              : "—"}
          </span>
        </div>
        {status.warning && (
          <div className="card card-warn">
            <span className="card-label">Warning</span>
            <span className="card-value">⚠ {status.warning}</span>
          </div>
        )}
      </section>

      <section>
        <div className="section-header">
          <h2>Sessions (today)</h2>
          <button type="button" className="btn" onClick={createNewSession}>
            New Session
          </button>
        </div>
        {newSessionId && (
          <p className="muted new-session-hint">
            New session ID: <code className="session-id">{newSessionId}</code> — use as{" "}
            <code>x-csm-session-id</code> header
          </p>
        )}
        {sessions.length === 0 ? (
          <p className="muted">No sessions yet. Call POST /v1/messages (with or without x-csm-session-id).</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="session-row"
                onClick={() => openDetail(s.id)}
                onKeyDown={(e) => e.key === "Enter" && openDetail(s.id)}
                role="button"
                tabIndex={0}
              >
                <span className="session-name">{s.name || s.id.slice(0, 8)}</span>
                <span className="session-meta">
                  {s.model} · {s.tokenUsed.toLocaleString()} / {s.tokenLimit.toLocaleString()} · $
                  {s.costEstimated.toFixed(4)}
                </span>
                <span className={`session-status status-${s.status}`}>{s.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && (
        <section className="detail-panel">
          <div className="section-header">
            <h2>Session: {detail.session.name || detail.session.id.slice(0, 8)}</h2>
            <div className="detail-actions">
              <button
                type="button"
                className="btn"
                onClick={() => summarizeSession(detail.session.id)}
                disabled={summarizing === detail.session.id}
              >
                {summarizing === detail.session.id ? "Summarizing…" : "Summarize Now"}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteSession(detail.session.id)}
              >
                Delete
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
          {summarizeDone === detail.session.id && (
            <p className="muted success-msg">✓ Summary generated and saved.</p>
          )}
          <p className="muted">
            {detail.session.model} · {detail.session.tokenUsedInput + detail.session.tokenUsedOutput} tokens · $
            {detail.session.costEstimated.toFixed(4)}
          </p>
          {detail.summaries.length > 0 && (
            <section className="summaries-section">
              <h3>Summaries</h3>
              {detail.summaries.map((s) => (
                <div key={s.id} className="summary-block">
                  <span className="summary-meta">v{s.version} · {s.tokenCount} tokens · {new Date(s.createdAt).toLocaleString()}</span>
                  <pre className="summary-text">{s.summaryText}</pre>
                </div>
              ))}
            </section>
          )}
          <h3>Messages</h3>
          <ul className="message-list">
            {detail.messages.map((m) => (
              <li key={m.id} className={`message message-${m.role} ${m.pinned ? "message-pinned" : ""}`}>
                <div className="message-header">
                  <span className="message-role">{m.role}</span>
                  <button
                    type="button"
                    className="btn btn-pin"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(detail.session.id, m.id, !m.pinned);
                    }}
                    title={m.pinned ? "Unpin" : "Pin"}
                  >
                    {m.pinned ? "📌 Pinned" : "Pin"}
                  </button>
                </div>
                <span className="message-content">{m.content ?? "(empty)"}</span>
                {m.tokenCountEst > 0 && (
                  <span className="message-tokens">~{m.tokenCountEst} tokens</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted footer">API key: {status.apiKeyConfigured ? "✓" : "✗"} · Polling every 5s</p>
    </div>
  );
}

export default App;
