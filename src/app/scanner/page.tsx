"use client";
import { useEffect, useState, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type AlertRule = {
  id: number; symbol: string; condition: string; threshold: number; enabled: boolean;
};
type ScannerRow = {
  id: number; symbol: string; name: string; note: string | null;
  price: number | null; change: number | null; openGapPct: number | null;
  volMultiple: number | null; low52: number | null; high52: number | null;
  rules: AlertRule[]; firedRules: AlertRule[];
};

const CONDITION_LABELS: Record<string, string> = {
  drop: "Drop %", spike: "Spike %", volume: "Volume ×", "52wLow": "Within % of 52W Low", gapDown: "Gap Down %",
};
const CONDITION_DEFAULTS: Record<string, number> = {
  drop: 5, spike: 5, volume: 2, "52wLow": 5, gapDown: 3,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt2 = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number | null | undefined, sign = true) =>
  n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(2)}%`;

function pct52w(price: number | null, low: number | null, high: number | null) {
  if (price == null || low == null || high == null || high === low) return null;
  return Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100));
}

function RangeBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: "#555" }}>—</span>;
  const color = pct <= 8 ? "#f59e0b" : pct >= 92 ? "#34d399" : "#3b82f6";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <div style={{ width: 52, height: 5, background: "#2a2a2a", borderRadius: 3, position: "relative" }}>
        <div style={{ position: "absolute", left: `${pct}%`, top: -3, width: 10, height: 10, borderRadius: "50%", background: color, transform: "translateX(-50%)" }} />
      </div>
      <span style={{ fontSize: "0.72rem", color: "#888", fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function VolBar({ mult }: { mult: number | null }) {
  if (mult == null) return <span style={{ color: "#555" }}>—</span>;
  const pct = Math.min((mult / 4) * 100, 100);
  const color = mult >= 2 ? "#f87171" : "#3b82f6";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <div style={{ width: 52, height: 5, background: "#2a2a2a", borderRadius: 3 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: "0.72rem", color: "#888", fontVariantNumeric: "tabular-nums" }}>{mult.toFixed(1)}×</span>
    </div>
  );
}

function AlertBadges({ row }: { row: ScannerRow }) {
  const badges: { label: string; color: string; bg: string }[] = [];
  const c = row.change ?? 0;
  const v = row.volMultiple ?? 0;
  const p52 = pct52w(row.price, row.low52, row.high52);
  const gap = row.openGapPct ?? 0;

  // Use fired rules if present, else fall back to global thresholds
  const hasFired = row.firedRules.length > 0;
  if (hasFired) {
    row.firedRules.forEach((r) => {
      if (r.condition === "drop")    badges.push({ label: `↓ DROP ${r.threshold}%`,   color: "#fca5a5", bg: "#450a0a" });
      if (r.condition === "spike")   badges.push({ label: `↑ SPIKE ${r.threshold}%`,  color: "#86efac", bg: "#052e16" });
      if (r.condition === "volume")  badges.push({ label: `⚡ VOL ×${r.threshold}`,   color: "#93c5fd", bg: "#0c2a4a" });
      if (r.condition === "52wLow")  badges.push({ label: `📉 52W LOW`,               color: "#fcd34d", bg: "#451a03" });
      if (r.condition === "gapDown") badges.push({ label: `⬇ GAP ${r.threshold}%`,   color: "#fdba74", bg: "#431407" });
    });
  } else {
    if (c <= -5) badges.push({ label: "↓ DROP", color: "#fca5a5", bg: "#450a0a" });
    if (c >= 5)  badges.push({ label: "↑ SPIKE", color: "#86efac", bg: "#052e16" });
    if (v >= 2)  badges.push({ label: "⚡ VOL", color: "#93c5fd", bg: "#0c2a4a" });
    if (p52 != null && p52 <= 8) badges.push({ label: "📉 52W LOW", color: "#fcd34d", bg: "#451a03" });
    if (gap <= -3) badges.push({ label: "⬇ GAP DN", color: "#fdba74", bg: "#431407" });
  }

  if (!badges.length) return <span style={{ color: "#444", fontSize: "0.72rem" }}>—</span>;
  return (
    <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
      {badges.map((b, i) => (
        <span key={i} style={{ background: b.bg, color: b.color, fontSize: "0.68rem", fontWeight: 700, padding: "2px 7px", borderRadius: 999, whiteSpace: "nowrap" }}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ─── Rule Editor Panel ────────────────────────────────────────────────────────
function RulePanel({ row, onClose, onSaved }: { row: ScannerRow; onClose: () => void; onSaved: () => void }) {
  const [rules, setRules] = useState<AlertRule[]>(row.rules);
  const [newCond, setNewCond]   = useState("drop");
  const [newThresh, setNewThresh] = useState(5);
  const [saving, setSaving] = useState(false);

  async function addRule() {
    setSaving(true);
    const res = await fetch("/api/scanner/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: row.symbol, condition: newCond, threshold: newThresh }),
    });
    const r = await res.json();
    setRules((p) => [...p, r]);
    setNewThresh(CONDITION_DEFAULTS[newCond]);
    setSaving(false);
    onSaved();
  }

  async function toggleRule(id: number, enabled: boolean) {
    await fetch("/api/scanner/rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    setRules((p) => p.map((r) => r.id === id ? { ...r, enabled: !enabled } : r));
    onSaved();
  }

  async function deleteRule(id: number) {
    await fetch("/api/scanner/rules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setRules((p) => p.filter((r) => r.id !== id));
    onSaved();
  }

  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 360, height: "100dvh", background: "#111", borderLeft: "1px solid #222", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-8px 0 32px rgba(0,0,0,0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #222" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{row.symbol} — Alert Rules</div>
          <div style={{ fontSize: "0.75rem", color: "#555", marginTop: 2 }}>{row.name}</div>
        </div>
        <button onClick={onClose} style={{ color: "#555", fontSize: "1.25rem", cursor: "pointer", background: "none", border: "none" }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.25rem" }}>
        {rules.length === 0 && (
          <p style={{ color: "#444", fontSize: "0.8rem", textAlign: "center", padding: "2rem 0" }}>No rules yet. Add one below.</p>
        )}
        {rules.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.75rem", marginBottom: "0.4rem", background: "#1a1a1a", borderRadius: 8, border: "1px solid #252525" }}>
            <div>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, color: r.enabled ? "#e2e8f0" : "#444" }}>
                {CONDITION_LABELS[r.condition]} ≥ {r.threshold}{r.condition === "volume" ? "×" : "%"}
              </div>
              <div style={{ fontSize: "0.7rem", color: r.enabled ? "#4ade80" : "#555", marginTop: 2 }}>
                {r.enabled ? "● Active" : "○ Paused"}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <button onClick={() => toggleRule(r.id, r.enabled)}
                style={{ fontSize: "0.7rem", padding: "3px 8px", borderRadius: 6, border: "1px solid #333", background: "transparent", color: "#888", cursor: "pointer" }}>
                {r.enabled ? "Pause" : "Enable"}
              </button>
              <button onClick={() => deleteRule(r.id)}
                style={{ fontSize: "0.7rem", padding: "3px 8px", borderRadius: 6, border: "1px solid #3f0a0a", background: "transparent", color: "#f87171", cursor: "pointer" }}>
                Remove
              </button>
            </div>
          </div>
        ))}

        {/* Add new rule */}
        <div style={{ marginTop: "1.25rem", padding: "0.875rem", background: "#0f1923", borderRadius: 10, border: "1px solid #1e3a5f" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#3b82f6", marginBottom: "0.75rem" }}>+ New Rule</div>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <select value={newCond} onChange={(e) => { setNewCond(e.target.value); setNewThresh(CONDITION_DEFAULTS[e.target.value]); }}
              style={{ flex: 1, background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#ccc", padding: "0.35rem 0.5rem", fontSize: "0.78rem" }}>
              {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input type="number" value={newThresh} min={0.1} step={0.5}
              onChange={(e) => setNewThresh(Number(e.target.value))}
              style={{ width: 70, background: "#0a0a0a", border: "1px solid #333", borderRadius: 6, color: "#ccc", padding: "0.35rem 0.5rem", fontSize: "0.78rem", textAlign: "center" }} />
          </div>
          <div style={{ fontSize: "0.72rem", color: "#555", marginBottom: "0.75rem" }}>
            {newCond === "volume" ? `Alert when volume ≥ ${newThresh}× the 10-day average`
              : newCond === "52wLow" ? `Alert when price is within ${newThresh}% of the 52-week low`
              : `Alert when ${CONDITION_LABELS[newCond].toLowerCase()} ≥ ${newThresh}%`}
          </div>
          <button onClick={addRule} disabled={saving}
            style={{ width: "100%", padding: "0.45rem", background: "#1e3a5f", color: "#3b82f6", border: "1px solid #3b82f6", borderRadius: 7, fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}>
            {saving ? "Saving…" : "Add Rule"}
          </button>
        </div>
      </div>

      <div style={{ padding: "0.875rem 1.25rem", borderTop: "1px solid #1a1a1a", fontSize: "0.7rem", color: "#555" }}>
        Rules are checked on every page refresh. In-app banners fire when a rule is triggered.
      </div>
    </div>
  );
}

// ─── Alert Toast ─────────────────────────────────────────────────────────────
function AlertToast({ alerts, onDismiss }: { alerts: string[]; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [alerts, onDismiss]);
  if (!alerts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100, display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: 360 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "0.75rem 1rem", display: "flex", alignItems: "flex-start", gap: "0.5rem", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>
          <span style={{ fontSize: "1rem" }}>🚨</span>
          <span style={{ fontSize: "0.8rem", color: "#fca5a5", flex: 1 }}>{a}</span>
          <button onClick={onDismiss} style={{ color: "#555", cursor: "pointer", background: "none", border: "none", fontSize: "1rem", lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ScannerPage() {
  const [rows, setRows]           = useState<ScannerRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [addSym, setAddSym]       = useState("");
  const [addNote, setAddNote]     = useState("");
  const [adding, setAdding]       = useState(false);
  const [ruleTarget, setRuleTarget] = useState<ScannerRow | null>(null);
  const [toastAlerts, setToastAlerts] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scanner");
      const data: ScannerRow[] = await res.json();
      setRows(data);
      setLastRefresh(new Date());

      // Collect fired alerts for toast
      const alerts: string[] = [];
      data.forEach((r) => {
        r.firedRules.forEach((rule) => {
          alerts.push(
            `${r.symbol}: ${CONDITION_LABELS[rule.condition]} rule triggered (threshold: ${rule.threshold}${rule.condition === "volume" ? "×" : "%"})`
          );
        });
      });
      if (alerts.length) {
        setToastAlerts(alerts);
        // Browser notification if permitted
        if (typeof window !== "undefined" && Notification.permission === "granted") {
          alerts.forEach((a) => new Notification("📊 Scanner Alert", { body: a }));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Request notification permission on mount
    if (typeof window !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(load, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  async function addTicker() {
    if (!addSym.trim()) return;
    setAdding(true);
    await fetch("/api/scanner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: addSym.trim().toUpperCase(), note: addNote.trim() || null }),
    });
    setAddSym("");
    setAddNote("");
    await load();
    setAdding(false);
  }

  async function removeTicker(symbol: string) {
    await fetch("/api/scanner", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    setRows((p) => p.filter((r) => r.symbol !== symbol));
  }

  const totalFired = rows.reduce((s, r) => s + r.firedRules.length, 0);

  const th: React.CSSProperties = { padding: "0.5rem 0.75rem", textAlign: "left", fontSize: "0.72rem", fontWeight: 600, color: "#555", borderBottom: "1px solid #1e1e1e", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "0.6rem 0.75rem", fontSize: "0.8rem", borderBottom: "1px solid #141414", verticalAlign: "middle" };

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0a", color: "#ccc", fontFamily: "'Inter', sans-serif" }}>
      {/* Nav */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "0 1.5rem", display: "flex", alignItems: "center", height: 48, gap: "1.5rem", background: "#0d0d0d" }}>
        <a href="/" style={{ fontWeight: 700, color: "#3b82f6", textDecoration: "none", fontSize: "0.9rem" }}>◀ Portfolio</a>
        <span style={{ color: "#1e1e1e" }}>|</span>
        <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e2e8f0" }}>Scanner & Watchlist</span>
        {totalFired > 0 && (
          <span style={{ marginLeft: "auto", background: "#7f1d1d", color: "#fca5a5", fontSize: "0.72rem", fontWeight: 700, padding: "2px 10px", borderRadius: 999 }}>
            🚨 {totalFired} rule{totalFired > 1 ? "s" : ""} firing
          </span>
        )}
        {lastRefresh && (
          <span style={{ marginLeft: totalFired ? "0.75rem" : "auto", fontSize: "0.72rem", color: "#444" }}>
            Refreshed {lastRefresh.toLocaleTimeString()}
          </span>
        )}
        <button onClick={load} style={{ fontSize: "0.75rem", padding: "0.25rem 0.75rem", borderRadius: 6, border: "1px solid #222", background: "transparent", color: "#666", cursor: "pointer" }}>
          ↻ Refresh
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>

        {/* Add ticker bar */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
          <input
            value={addSym} onChange={(e) => setAddSym(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && addTicker()}
            placeholder="Ticker symbol (e.g. NVDA)"
            style={{ width: 160, background: "#111", border: "1px solid #222", borderRadius: 8, color: "#ccc", padding: "0.45rem 0.75rem", fontSize: "0.82rem", fontFamily: "monospace" }}
          />
          <input
            value={addNote} onChange={(e) => setAddNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTicker()}
            placeholder="Optional note (e.g. watching for Q2 reaction)"
            style={{ flex: 1, minWidth: 200, background: "#111", border: "1px solid #222", borderRadius: 8, color: "#ccc", padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
          />
          <button onClick={addTicker} disabled={adding || !addSym.trim()}
            style={{ padding: "0.45rem 1.25rem", background: "#1e3a5f", color: "#3b82f6", border: "1px solid #3b82f6", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" }}>
            {adding ? "Adding…" : "+ Add to Watchlist"}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: "#444", padding: "3rem 0", textAlign: "center" }}>Loading scanner data…</p>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "#444" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📋</div>
            <div style={{ fontWeight: 600, color: "#666", marginBottom: "0.4rem" }}>Watchlist is empty</div>
            <div style={{ fontSize: "0.82rem" }}>Add a ticker above to start monitoring</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid #1e1e1e" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0d0d0d" }}>
                  <th style={th}>Ticker</th>
                  <th style={{ ...th, textAlign: "right" }}>Price</th>
                  <th style={{ ...th, textAlign: "right" }}>Change</th>
                  <th style={{ ...th, textAlign: "right" }}>Open Gap</th>
                  <th style={{ ...th, textAlign: "right" }}>Vol vs Avg</th>
                  <th style={{ ...th, textAlign: "right" }}>52W Range</th>
                  <th style={th}>Alerts</th>
                  <th style={{ ...th, textAlign: "right" }}>Rules</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const chgColor = !row.change ? "#666" : row.change > 0 ? "#4ade80" : "#f87171";
                  const gapColor = !row.openGapPct ? "#666" : row.openGapPct > 0 ? "#4ade80" : "#f87171";
                  const hasFiredRules = row.firedRules.length > 0;
                  return (
                    <tr key={row.id} style={{ background: hasFiredRules ? "rgba(127,29,29,0.12)" : "transparent" }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: "0.88rem", color: "#e2e8f0" }}>{row.symbol}</div>
                        <div style={{ fontSize: "0.7rem", color: "#555", marginTop: 1 }}>{row.name}</div>
                        {row.note && <div style={{ fontSize: "0.68rem", color: "#3b82f6", marginTop: 2, fontStyle: "italic" }}>{row.note}</div>}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: "#e2e8f0" }}>
                        ${fmt2(row.price)}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: chgColor, fontWeight: 600 }}>
                        {fmtPct(row.change)}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: gapColor }}>
                        {fmtPct(row.openGapPct)}
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <VolBar mult={row.volMultiple} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <RangeBar pct={pct52w(row.price, row.low52, row.high52)} />
                      </td>
                      <td style={td}>
                        <AlertBadges row={row} />
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <button onClick={() => setRuleTarget(row)}
                          style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: 6, border: `1px solid ${row.rules.length ? "#1e3a5f" : "#222"}`, background: row.rules.length ? "#0c1d30" : "transparent", color: row.rules.length ? "#3b82f6" : "#555", cursor: "pointer" }}>
                          {row.rules.length ? `⚙ ${row.rules.length} rule${row.rules.length > 1 ? "s" : ""}` : "⚙ Rules"}
                        </button>
                      </td>
                      <td style={td}>
                        <button onClick={() => removeTicker(row.symbol)}
                          style={{ fontSize: "0.72rem", padding: "3px 8px", borderRadius: 6, border: "1px solid #1a0a0a", background: "transparent", color: "#555", cursor: "pointer" }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "0.75rem", fontSize: "0.72rem", color: "#333" }}>
          Auto-refreshes every 60s. Alert rules are evaluated on each refresh.
        </div>
      </div>

      {/* Rule panel slide-in */}
      {ruleTarget && (
        <>
          <div onClick={() => setRuleTarget(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
          <RulePanel
            row={ruleTarget}
            onClose={() => setRuleTarget(null)}
            onSaved={() => { load(); setRuleTarget(rows.find((r) => r.id === ruleTarget.id) ?? ruleTarget); }}
          />
        </>
      )}

      {/* Toast alerts */}
      <AlertToast alerts={toastAlerts} onDismiss={() => setToastAlerts([])} />
    </div>
  );
}