"use client";
import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type ChartPoint = { date: string; portfolioValue: number; spyValue: number; stockPrice: number };
type Snapshot   = { price: number; value: number; date: string } | null;
type NewsItem   = { title: string; link: string; publisher: string; publishedAt: string | number; thumbnail: string | null };

type SimResult = {
  symbol: string; shares: number; actualEntryDate: string;
  entryPrice: number; currentPrice: number; costBasis: number;
  currentValue: number; gainLoss: number; gainLossPct: number;
  cagr: number; daysHeld: number; spyReturn: number; alpha: number;
  maxDrawdown: number; bestPrice: number; worstPrice: number;
  snapshots: { d7: Snapshot; d30: Snapshot; d90: Snapshot };
  chartData: ChartPoint[];
  news: NewsItem[];
  marketContext: { spyReturn: number; spyVolatilityPct: number; sector: string | null; recommendation: string | null };
};

type SavedSim = {
  id: number; symbol: string; entryDate: string; shares: number;
  entryPrice: number; currentPrice: number; gainLossPct: number;
  cagr: number; daysHeld: number; alpha: number;
  tags: string[]; note: string | null; createdAt: string;
};

const TAGS = [
  "Earnings Miss", "Earnings Beat", "Macro Selloff", "Regulatory News",
  "Product Launch", "Analyst Downgrade", "Analyst Upgrade", "Insider Selling",
  "Sector Rotation", "One-Time Event", "Recoverable", "Fundamental Damage",
];

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt    = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number | null | undefined, sign = true) =>
  n == null ? "—" : `${sign && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const clr    = (n: number | null | undefined) =>
  n == null ? "#888" : n >= 0 ? "#4ade80" : "#f87171";
const timeAgo = (ts: string | number) => {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ─── Dual-line SVG Chart ──────────────────────────────────────────────────────
function DualChart({ data, symbol }: { data: ChartPoint[]; symbol: string }) {
  const [tooltip, setTooltip] = useState<{ x: number; idx: number } | null>(null);
  if (!data.length) return <p style={{ color: "#555", padding: "2rem 0", textAlign: "center" }}>No chart data.</p>;

  const W = 700, H = 200, PAD = { top: 20, bottom: 32, left: 16, right: 16 };
  const allVals = data.flatMap((d) => [d.portfolioValue, d.spyValue]);
  const minV = Math.min(...allVals), maxV = Math.max(...allVals), range = maxV - minV || 1;
  const xS = (i: number) => PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const yS = (v: number) => PAD.top  + (1 - (v - minV) / range) * (H - PAD.top - PAD.bottom);

  const stockPts = data.map((d, i) => `${xS(i)},${yS(d.portfolioValue)}`).join(" ");
  const spyPts   = data.map((d, i) => `${xS(i)},${yS(d.spyValue)}`).join(" ");
  const stockColor = data[data.length - 1].portfolioValue >= data[0].portfolioValue ? "#4ade80" : "#f87171";
  const spyColor   = "#3b82f6";

  const labelIdxs = [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor(data.length * 3 / 4), data.length - 1];

  return (
    <div>
      <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ width: 12, height: 3, background: stockColor, borderRadius: 2 }} />
          <span style={{ fontSize: "0.78rem", color: "#aaa" }}>{symbol} position value</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <div style={{ width: 12, height: 3, background: spyColor, borderRadius: 2, opacity: 0.7 }} />
          <span style={{ fontSize: "0.78rem", color: "#aaa" }}>SPY (same $ invested)</span>
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const mx   = (e.clientX - rect.left) / rect.width * W;
            const idx  = Math.min(data.length - 1, Math.max(0, Math.round((mx - PAD.left) / (W - PAD.left - PAD.right) * (data.length - 1))));
            setTooltip({ x: xS(idx), idx });
          }}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id="sgFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={stockColor} stopOpacity="0.12" />
              <stop offset="100%" stopColor={stockColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`M${xS(0)},${yS(data[0].portfolioValue)} ${data.map((d, i) => `L${xS(i)},${yS(d.portfolioValue)}`).join(" ")} L${xS(data.length - 1)},${H - PAD.bottom} L${xS(0)},${H - PAD.bottom} Z`}
            fill="url(#sgFill)"
          />
          <polyline points={spyPts}   fill="none" stroke={spyColor}   strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6" />
          <polyline points={stockPts} fill="none" stroke={stockColor} strokeWidth="2"   strokeLinejoin="round" />
          {tooltip && (
            <>
              <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={H - PAD.bottom} stroke="#333" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx={tooltip.x} cy={yS(data[tooltip.idx].portfolioValue)} r="4" fill={stockColor} stroke="#111" strokeWidth="2" />
              <circle cx={tooltip.x} cy={yS(data[tooltip.idx].spyValue)}       r="4" fill={spyColor}   stroke="#111" strokeWidth="2" />
            </>
          )}
          {labelIdxs.map((i) => (
            <text key={i} x={xS(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#444">
              {data[i]?.date?.slice(5)}
            </text>
          ))}
        </svg>
        {tooltip && (() => {
          const d    = data[tooltip.idx];
          const left = tooltip.x > W * 0.6;
          return (
            <div style={{
              position: "absolute", top: 8,
              left:  left ? undefined : `${(tooltip.x / W) * 100 + 2}%`,
              right: left ? `${((W - tooltip.x) / W) * 100 + 2}%` : undefined,
              background: "#1a1a1a", border: "1px solid #333", borderRadius: 8,
              padding: "0.5rem 0.75rem", fontSize: "0.78rem", pointerEvents: "none", minWidth: 160,
            }}>
              <div style={{ color: "#555", marginBottom: 4 }}>{d.date}</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span style={{ color: "#aaa" }}>{symbol}</span>
                <span style={{ color: stockColor, fontWeight: 700 }}>{fmt(d.portfolioValue)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span style={{ color: "#aaa" }}>SPY</span>
                <span style={{ color: spyColor, fontWeight: 700 }}>{fmt(d.spyValue)}</span>
              </div>
              <div style={{ color: "#444", fontSize: "0.7rem", marginTop: 4 }}>{symbol} price: {fmt(d.stockPrice)}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SimulatorPage() {
  const [symbol,       setSymbol]       = useState("");
  const [entryDate,    setEntryDate]    = useState("");
  const [shares,       setShares]       = useState("10");
  const [result,       setResult]       = useState<SimResult | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [note,         setNote]         = useState("");
  const [saving,       setSaving]       = useState(false);
  const [savedMsg,     setSavedMsg]     = useState(false);
  const [saved,        setSaved]        = useState<SavedSim[]>([]);
  const [showSaved,    setShowSaved]    = useState(false);
  const [activePanel,  setActivePanel]  = useState<"chart" | "context" | "snapshots">("chart");
  const [holdings,     setHoldings]     = useState<{ symbol: string; avgCost: number }[]>([]);

  useEffect(() => {
    fetch("/api/stocks").then((r) => r.json()).then(setHoldings).catch(() => {});
    loadSaved();
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    setEntryDate(d.toISOString().split("T")[0]);
  }, []);

  async function loadSaved() {
    const r = await fetch("/api/simulator/saved");
    if (r.ok) setSaved(await r.json());
  }

  async function runSimulation(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null); setSelectedTags([]); setNote("");
    try {
      const params = new URLSearchParams({ symbol, entryDate, shares });
      const r = await fetch(`/api/simulator?${params}`);
      const d = await r.json();
      if (d.error) { setError(d.error); return; }
      setResult(d);
      setActivePanel("chart");
    } catch {
      setError("Failed to fetch simulation data.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSimulation() {
    if (!result) return;
    setSaving(true);
    await fetch("/api/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: result.symbol, entryDate: result.actualEntryDate,
        shares: result.shares, entryPrice: result.entryPrice,
        currentPrice: result.currentPrice, gainLossPct: result.gainLossPct,
        cagr: result.cagr, daysHeld: result.daysHeld, alpha: result.alpha,
        tags: selectedTags, note,
      }),
    });
    setSaving(false); setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
    loadSaved();
  }

  async function deleteSaved(id: number) {
    await fetch("/api/simulator/saved", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadSaved();
  }

  const toggleTag = (tag: string) =>
    setSelectedTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag]);

  const card: React.CSSProperties  = { background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, padding: "1.25rem" };
  const label: React.CSSProperties = { fontSize: "0.75rem", color: "#666", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" };
  const input: React.CSSProperties = { background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#e5e5e5", padding: "0.5rem 0.75rem", fontSize: "0.88rem", width: "100%" };
  const kpi: React.CSSProperties   = { background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 10, padding: "0.875rem 1rem" };
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: "0.35rem 1rem", fontSize: "0.8rem", fontWeight: 600, borderRadius: 7, cursor: "pointer",
    border: `1px solid ${active ? "#3b82f6" : "#2a2a2a"}`,
    background: active ? "#1e3a5f" : "transparent",
    color: active ? "#3b82f6" : "#666",
  });

  return (
    <div style={{ minHeight: "100dvh", background: "#0a0a0a", color: "#e5e5e5", fontFamily: "system-ui, sans-serif" }}>

      {/* Nav */}
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "0 1.5rem", display: "flex", alignItems: "center", height: 48, gap: "1.25rem", background: "#0d0d0d" }}>
        <a href="/"        style={{ color: "#3b82f6", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>◀ Portfolio</a>
        <span style={{ color: "#222" }}>|</span>
        <a href="/scanner" style={{ color: "#666",   textDecoration: "none", fontSize: "0.85rem" }}>Scanner</a>
        <span style={{ color: "#222" }}>|</span>
        <span style={{ color: "#e5e5e5", fontSize: "0.85rem", fontWeight: 700 }}>⏱ Simulator</span>
        <button
          onClick={() => { setShowSaved((p) => !p); loadSaved(); }}
          style={{ marginLeft: "auto", fontSize: "0.78rem", padding: "0.25rem 0.875rem", borderRadius: 7, border: "1px solid #2a2a2a", background: showSaved ? "#1e3a5f" : "transparent", color: showSaved ? "#3b82f6" : "#666", cursor: "pointer" }}>
          📋 Saved ({saved.length})
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <h1 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: "0.25rem" }}>⏱ What-If Simulator</h1>
          <p style={{ color: "#555", fontSize: "0.82rem" }}>Enter a hypothetical position to see P&L, vs S&P 500, and the market context at entry</p>
        </div>

        {/* ── INPUT FORM ─────────────────────────────────────────────── */}
        <div style={{ ...card, marginBottom: "1.25rem" }}>
          <form onSubmit={runSimulation}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.875rem", marginBottom: "1rem" }}>
              <div>
                <div style={label}>Ticker Symbol</div>
                <input style={input} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="NVDA" required list="holdings-list" />
                <datalist id="holdings-list">
                  {holdings.map((h) => <option key={h.symbol} value={h.symbol} />)}
                </datalist>
              </div>
              <div>
                <div style={label}>Entry Date</div>
                <input style={input} type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)}
                  required max={new Date().toISOString().split("T")[0]} />
              </div>
              <div>
                <div style={label}>Number of Shares</div>
                <input style={input} type="number" min="0.001" step="any"
                  value={shares} onChange={(e) => setShares(e.target.value)} required placeholder="10" />
              </div>
            </div>

            {holdings.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ ...label, marginBottom: "0.4rem" }}>Quick-fill from your holdings</div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {holdings.map((h) => (
                    <button key={h.symbol} type="button"
                      onClick={() => setSymbol(h.symbol)}
                      style={{ fontSize: "0.75rem", padding: "3px 10px", borderRadius: 20, cursor: "pointer",
                        border: `1px solid ${symbol === h.symbol ? "#3b82f6" : "#2a2a2a"}`,
                        background: symbol === h.symbol ? "#1e3a5f" : "transparent",
                        color: symbol === h.symbol ? "#3b82f6" : "#888" }}>
                      {h.symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "0.5rem 1.5rem", fontSize: "0.88rem", fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "⏳ Simulating…" : "▶ Run Simulation"}
            </button>
          </form>
        </div>

        {error && (
          <div style={{ background: "#1a0a0a", border: "1px solid #7f1d1d", borderRadius: 10, padding: "0.875rem 1rem", color: "#fca5a5", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── RESULTS ─────────────────────────────────────────────────── */}
        {result && (
          <>
            {/* KPI strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.6rem", marginBottom: "1rem" }}>
              {[
                { l: "Cost Basis",    v: fmt(result.costBasis),     sub: `${result.shares} shares @ ${fmt(result.entryPrice)}` },
                { l: "Current Value", v: fmt(result.currentValue),  sub: `@ ${fmt(result.currentPrice)} today`,  c: clr(result.gainLoss) },
                { l: "Total P&L",     v: fmt(result.gainLoss),      sub: fmtPct(result.gainLossPct),             c: clr(result.gainLoss) },
                { l: "CAGR",          v: fmtPct(result.cagr),       sub: `${result.daysHeld} days held`,         c: clr(result.cagr) },
                { l: "vs S&P 500",    v: fmtPct(result.alpha),      sub: `SPY: ${fmtPct(result.spyReturn)}`,     c: clr(result.alpha) },
                { l: "Max Drawdown",  v: fmtPct(result.maxDrawdown, false), sub: "Peak-to-trough",              c: "#f87171" },
                { l: "Best Price",    v: fmt(result.bestPrice),     sub: fmtPct(((result.bestPrice - result.entryPrice) / result.entryPrice) * 100) + " from entry", c: "#4ade80" },
                { l: "Worst Price",   v: fmt(result.worstPrice),    sub: fmtPct(((result.worstPrice - result.entryPrice) / result.entryPrice) * 100) + " from entry", c: "#f87171" },
              ].map((k) => (
                <div key={k.l} style={kpi}>
                  