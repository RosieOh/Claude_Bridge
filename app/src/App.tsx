import { useEffect, useState } from "react";

const PROXY_BASE = "http://127.0.0.1:37891";

interface Status {
  proxy: string;
  currentSession: { id: string; tokens: number; limit: number } | null;
  todayTokens: number;
  todayCost: number;
  model: string | null;
  warning: string | null;
  apiKeyConfigured: boolean;
  recentErrors: string[];
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${PROXY_BASE}/internal/status`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to fetch status");
          setStatus(null);
        }
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error && !status) {
    return (
      <div className="container">
        <h1>CSM</h1>
        <p className="error">Proxy not reachable. Start the proxy first (e.g. <code>npm run dev:proxy</code>).</p>
        <p className="muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>CSM — Claude Session Manager</h1>
      <section>
        <h2>Status</h2>
        <ul>
          <li>Proxy: <strong>{status?.proxy ?? "—"}</strong></li>
          <li>API key: {status?.apiKeyConfigured ? "✓" : "✗"}</li>
          <li>Today tokens: {status?.todayTokens ?? 0}</li>
          <li>Today cost: ${status?.todayCost?.toFixed(4) ?? "0"}</li>
          <li>Current session: {status?.currentSession ? `${status.currentSession.tokens} / ${status.currentSession.limit}` : "—"}</li>
          {status?.warning && <li className="warn">⚠ {status.warning}</li>}
        </ul>
      </section>
      <p className="muted">Menu bar: tray icon shows live status. This window = Dashboard (Phase 1).</p>
    </div>
  );
}

export default App;
