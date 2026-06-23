"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type StockRow = {
  id: number; symbol: string; quantity: number; avgCost: number;
  currentPrice: number | null; currentValue: number | null; costBasis: number;
  gainLoss: number | null; gainLossPct: number | null;
  regularMarketDayHigh?: number; regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number;
  regularMarketPreviousClose?: number; marketCap?: number;
  regularMarketChangePercent?: number;
};
type Portfolio = { stocks: StockRow[]; totalValue: number; totalCost: number; totalGainLoss: number; };
type NewsItem = { title: string; link: string; publisher: string; publishedAt: string | number; thumbnail: string | null; };
type ChartPoint = { date: string; close: number; };
type EarningsTrendItem = {
  period?: string; growth?: number;
  earningsEstimate?: { avg?: number; low?: number; high?: number; numberOfAnalysts?: number };
  revenueEstimate?: { avg?: number; low?: number; high?: number };
};
type InsiderHolder = {
  name?: string; relation?: string; transactionDescription?: string;
  latestTransDate?: string; positionDirectDate?: string; shares?: number;
};
type InstitutionHolder = {
  organization?: string; reportDate?: string; position?: number; value?: number; pctHeld?: number;
};
type UpgradeItem = {
  firm?: string; toGrade?: string; fromGrade?: string; action?: string; epochGradeDate?: number;
};
type SummaryData = {
  financialData?: {
    targetMeanPrice?: number; targetHighPrice?: number; targetLowPrice?: number;
    recommendationKey?: string; numberOfAnalystOpinions?: number;
    revenueGrowth?: number; profitMargins?: number; debtToEquity?: number;
  };
  defaultKeyStatistics?: {
    trailingEps?: number; forwardPE?: number; shortPercentOfFloat?: number;
    heldPercentInsiders?: number; heldPercentInstitutions?: number;
  };
  summaryDetail?: { trailingPE?: number; forwardPE?: number; dividendYield?: number; };
  assetProfile?: {
    longBusinessSummary?: string; sector?: string; industry?: string;
    fullTimeEmployees?: number; website?: string; city?: string; state?: string; country?: string;
  };
  calendarEvents?: { earnings?: { earningsDate?: (Date | string)[] } };
  earningsTrend?: { trend?: EarningsTrendItem[] };
  insiderHolders?: { holders?: InsiderHolder[] };
  institutionOwnership?: { ownershipList?: InstitutionHolder[] };
  majorHoldersBreakdown?: {
    insidersPercentHeld?: number; institutionsPercentHeld?: number; institutionsCount?: number;
  };
  upgradeDowngradeHistory?: { history?: UpgradeItem[] };
};

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt = (n: number | null | undefined, prefix = "$") =>
  n == null ? "—" : `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return fmt(n);
};
const fmtPct = (n: number | null | undefined) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const timeAgo = (ts: string | number | null) => {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
const daysUntil = (d: Date | string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
const fmtDate = (d?: string | number | null) =>
  !d ? "—" : new Date(typeof d === "number" && d < 1e12 ? d * 1000 : d)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ─── Sub-components ───────────────────────────────────────────────────────────
function RangeBar({ low, high, current, color = "#3b82f6" }: { low: number; high: number; current: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div style={{ marginTop: "0.5rem" }}>
      <div style={{ position: "relative", height: "6px", background: "#2a2a2a", borderRadius: "3px" }}>
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: "100%", background: color, borderRadius: "3px" }} />
        <div style={{ position: "absolute", left: `${pct}%`, top: "-4px", width: "3px", height: "14px", background: "#fff", borderRadius: "2px", transform: "translateX(-50%)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem", fontSize: "0.75rem", color: "#666" }}>
        <span>{fmt(low)}</span><span style={{ color: "#aaa" }}>{fmt(current)}</span><span>{fmt(high)}</span>
      </div>
    </div>
  );
}

function AnalystBar({ rec }: { rec: string }) {
  const map: Record<string, { label: string; color: string; pct: number }> = {
    strongBuy:    { label: "Strong Buy",    color: "#4ade80", pct: 90 },
    buy:          { label: "Buy",           color: "#86efac", pct: 70 },
    hold:         { label: "Hold",          color: "#facc15", pct: 50 },
    underperform: { label: "Underperform",  color: "#f87171", pct: 30 },
    sell:         { label: "Sell",          color: "#f87171", pct: 10 },
  };
  const r = map[rec] ?? { label: rec, color: "#888", pct: 50 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
      <span style={{ color: r.color, fontWeight: 700, fontSize: "0.9rem", minWidth: "110px" }}>{r.label}</span>
      <div style={{ flex: 1, height: "6px", background: "#2a2a2a", borderRadius: "3px" }}>
        <div style={{ width: `${r.pct}%`, height: "100%", background: r.color, borderRadius: "3px" }} />
      </div>
    </div>
  );
}

function SVGChart({ data, period, onPeriodChange }: { data: ChartPoint[]; period: string; onPeriodChange: (p: string) => void }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; price: number } | null>(null);
  if (!data.length) return <p style={{ color: "#555", padding: "2rem 0" }}>No chart data available.</p>;
  const W = 600, H = 160, PAD = { top: 16, bottom: 28, left: 10, right: 10 };
  const prices = data.map((d) => d.close);
  const minP = Math.min(...prices), maxP = Math.max(...prices), range = maxP - minP || 1;
  const xScale = (i: number) => PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const yScale = (p: number) => PAD.top + (1 - (p - minP) / range) * (H - PAD.top - PAD.bottom);
  const pts = data.map((d, i) => `${xScale(i)},${yScale(d.close)}`).join(" ");
  const isUp = prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? "#4ade80" : "#f87171";
  const areaPath = `M${xScale(0)},${yScale(data[0].close)} ${data.map((d, i) => `L${xScale(i)},${yScale(d.close)}`).join(" ")} L${xScale(data.length - 1)},${H - PAD.bottom} L${xScale(0)},${H - PAD.bottom} Z`;
  const periods = ["1D", "1W", "1M", "3M", "YTD", "6M", "1Y"];
  const changePct = ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(2);
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width * W;
    const c = Math.min(data.length - 1, Math.max(0, Math.round((mx - PAD.left) / (W - PAD.left - PAD.right) * (data.length - 1))));
    setTooltip({ x: xScale(c), y: yScale(data[c].close), date: data[c].date, price: data[c].close });
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.85rem", color: isUp ? "#4ade80" : "#f87171", fontWeight: 600 }}>{isUp ? "▲" : "▼"} {changePct}% over period</span>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {periods.map((p) => (
            <button key={p} onClick={() => onPeriodChange(p)}
              style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem", borderRadius: "4px", border: "1px solid", cursor: "pointer",
                background: period === p ? "#1e3a5f" : "transparent", color: period === p ? "#3b82f6" : "#888", borderColor: period === p ? "#3b82f6" : "#333" }}>
              {p}
            </button>
          ))}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>
          <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={lineColor} stopOpacity="0.15" /><stop offset="100%" stopColor={lineColor} stopOpacity="0" /></linearGradient></defs>
          <path d={areaPath} fill="url(#chartFill)" />
          <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
          {tooltip && (<><line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={H - PAD.bottom} stroke="#444" strokeWidth="1" strokeDasharray="3,3" /><circle cx={tooltip.x} cy={tooltip.y} r="4" fill={lineColor} stroke="#111" strokeWidth="2" /></>)}
          {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
            <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="10" fill="#555">{data[i]?.date}</text>
          ))}
        </svg>
        {tooltip && (
          <div style={{ position: "absolute", top: "8px", left: tooltip.x > 300 ? "8px" : "auto", right: tooltip.x <= 300 ? "8px" : "auto", background: "#1a1a1a", border: "1px solid #333", borderRadius: "6px", padding: "0.4rem 0.6rem", fontSize: "0.8rem", pointerEvents: "none" }}>
            <div style={{ color: "#aaa" }}>{tooltip.date}</div>
            <div style={{ color: "#e5e5e5", fontWeight: 700 }}>{fmt(tooltip.price)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

type TabKey = "stats" | "chart" | "profile" | "news";

export default function Home() {
  const [portfolio, setPortfolio]           = useState<Portfolio | null>(null);
  const [symbol, setSymbol]                 = useState("");
  const [quantity, setQuantity]             = useState("");
  const [avgCost, setAvgCost]               = useState("");
  const [loading, setLoading]               = useState(false);
  const [fetching, setFetching]             = useState(false);
  const [mounted, setMounted]               = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo]         = useState(0);
  const [expandedId, setExpandedId]         = useState<number | null>(null);
  const [activeTab, setActiveTab]           = useState<Record<number, TabKey>>({});
  const [newsCache, setNewsCache]           = useState<Record<number, NewsItem[]>>({});
  const [newsLoading, setNewsLoading]       = useState<Record<number, boolean>>({});
  const [chartCache, setChartCache]         = useState<Record<string, ChartPoint[]>>({});
  const [chartLoading, setChartLoading]     = useState(false);
  const [chartPeriod, setChartPeriod]       = useState<Record<number, string>>({});
  const [summaryCache, setSummaryCache]     = useState<Record<number, SummaryData>>({});
  const [summaryLoading, setSummaryLoading] = useState<Record<number, boolean>>({});
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [editQty, setEditQty]               = useState("");
  const [editAvgCost, setEditAvgCost]       = useState("");
  const [expandedDesc, setExpandedDesc]     = useState<Record<number, boolean>>({});
  const prevPrices = useRef<Record<number, number | null>>({});

  const fetchPortfolio = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/portfolio");
      const data: Portfolio = await res.json();
      setPortfolio((prev) => {
        if (prev) { const m: Record<number, number | null> = {}; prev.stocks.forEach((s) => { m[s.id] = s.currentPrice; }); prevPrices.current = m; }
        return data;
      });
      setLastUpdated(new Date());
    } finally { setFetching(false); }
  }, []);

  const fetchNews = useCallback(async (id: number, sym: string) => {
    if (newsCache[id]) return;
    setNewsLoading((p) => ({ ...p, [id]: true }));
    try { const r = await fetch(`/api/news?symbol=${sym}`); const d = await r.json(); setNewsCache((p) => ({ ...p, [id]: d.news ?? [] })); }
    finally { setNewsLoading((p) => ({ ...p, [id]: false })); }
  }, [newsCache]);

  const fetchChart = useCallback(async (id: number, sym: string, period: string) => {
    const key = `${id}-${period}`; if (chartCache[key]) return;
    setChartLoading(true);
    try { const r = await fetch(`/api/chart?symbol=${sym}&period=${period}`); const d = await r.json(); setChartCache((p) => ({ ...p, [key]: d.data ?? [] })); }
    finally { setChartLoading(false); }
  }, [chartCache]);

  const fetchSummary = useCallback(async (id: number, sym: string) => {
    if (summaryCache[id]) return;
    setSummaryLoading((p) => ({ ...p, [id]: true }));
    try { const r = await fetch(`/api/summary?symbol=${sym}`); const d = await r.json(); setSummaryCache((p) => ({ ...p, [id]: d })); }
    finally { setSummaryLoading((p) => ({ ...p, [id]: false })); }
  }, [summaryCache]);

  useEffect(() => { setMounted(true); fetchPortfolio(); const iv = setInterval(fetchPortfolio, 30_000); return () => clearInterval(iv); }, [fetchPortfolio]);
  useEffect(() => { const iv = setInterval(() => { if (lastUpdated) setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000)); }, 1000); return () => clearInterval(iv); }, [lastUpdated]);

  function toggleRow(s: StockRow) {
    if (editingId === s.id) return;
    const opening = expandedId !== s.id;
    setExpandedId(opening ? s.id : null);
    if (opening) {
      setActiveTab((p) => ({ ...p, [s.id]: p[s.id] ?? "stats" }));
      fetchNews(s.id, s.symbol); fetchSummary(s.id, s.symbol);
      fetchChart(s.id, s.symbol, chartPeriod[s.id] ?? "1M");
    }
  }
  function switchTab(id: number, tab: TabKey, sym: string) {
    setActiveTab((p) => ({ ...p, [id]: tab }));
    if (tab === "news")   fetchNews(id, sym);
    if (tab === "chart")  fetchChart(id, sym, chartPeriod[id] ?? "1M");
    if (tab === "stats" || tab === "profile") fetchSummary(id, sym);
  }
  function changePeriod(id: number, sym: string, period: string) { setChartPeriod((p) => ({ ...p, [id]: period })); fetchChart(id, sym, period); }

  async function addStock(e: React.FormEvent) {
    e.preventDefault(); setLoading(true);
    await fetch("/api/stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol, quantity: +quantity, avgCost: +avgCost }) });
    setSymbol(""); setQuantity(""); setAvgCost(""); await fetchPortfolio(); setLoading(false);
  }
  async function deleteStock(id: number) { await fetch(`/api/stocks/${id}`, { method: "DELETE" }); setExpandedId(null); await fetchPortfolio(); }
  async function saveEdit(id: number) {
    await fetch("/api/stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: portfolio!.stocks.find((s) => s.id === id)!.symbol, quantity: +editQty, avgCost: +editAvgCost }) });
    setEditingId(null); await fetchPortfolio();
  }

  const gainColor = (v: number | null | undefined) => v == null ? "" : v >= 0 ? "positive" : "negative";
  const priceArrow = (s: StockRow) => { const prev = prevPrices.current[s.id]; if (prev == null || s.currentPrice == null) return null; if (s.currentPrice > prev) return <span style={{ color: "#4ade80" }}> ▲</span>; if (s.currentPrice < prev) return <span style={{ color: "#f87171" }}> ▼</span>; return null; };

  if (!mounted) return null;
  const totalValue = portfolio?.totalValue ?? 0;

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div><h1>📈 Portfolio Tracker</h1><p style={{ color: "#888", marginBottom: "1rem" }}>Track your holdings and research stocks in real time</p></div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {lastUpdated && <span style={{ color: "#888", fontSize: "0.85rem" }}>Last updated: {secondsAgo}s ago</span>}
          <button className="btn-primary" onClick={fetchPortfolio} disabled={fetching} style={{ padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}>{fetching ? "⏳" : "🔄 Refresh"}</button>
        </div>
      </div>

      {portfolio && (
        <div className="card">
          <p style={{ color: "#888", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Net Worth</p>
          <p className="net-worth">{fetching ? "Updating…" : fmt(portfolio.totalValue)}</p>
          <p className="subtitle">Cost Basis: {fmt(portfolio.totalCost)}&nbsp;&nbsp;|&nbsp;&nbsp;
            <span className={gainColor(portfolio.totalGainLoss)}>Total P&L: {fmt(portfolio.totalGainLoss)}{portfolio.totalCost > 0 && ` (${((portfolio.totalGainLoss / portfolio.totalCost) * 100).toFixed(2)}%)`}</span>
          </p>
        </div>
      )}

      <form onSubmit={addStock}>
        <label>Ticker Symbol<input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL" required /></label>
        <label>Quantity<input type="number" min="0.0001" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="10" required /></label>
        <label>Avg Cost ($)<input type="number" min="0.0001" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="150.00" required /></label>
        <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: "flex-end" }}>{loading ? "Adding…" : "Add / Update Stock"}</button>
      </form>

      {fetching && !portfolio && <div className="empty"><p>Loading portfolio…</p></div>}
      {!fetching && portfolio?.stocks.length === 0 && <div className="empty"><p>No stocks yet.</p><p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Add your first holding above ↑</p></div>}

      {portfolio && portfolio.stocks.length > 0 && (
        <table>
          <thead><tr><th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>Live Price</th><th>Market Value</th><th>Allocation</th><th>Cost Basis</th><th>P&L ($)</th><th>P&L (%)</th><th>Actions</th></tr></thead>
          <tbody>
            {portfolio.stocks.map((s) => {
              const tab      = activeTab[s.id] ?? "stats";
              const period   = chartPeriod[s.id] ?? "1M";
              const chartKey = `${s.id}-${period}`;
              const sum      = summaryCache[s.id];
              const fd  = sum?.financialData; const ks = sum?.defaultKeyStatistics;
              const sd  = sum?.summaryDetail; const ap = sum?.assetProfile;
              const ce  = sum?.calendarEvents;
              const et  = sum?.earningsTrend?.trend?.slice(0, 4) ?? [];
              const insiders     = sum?.insiderHolders?.holders?.slice(0, 5) ?? [];
              const institutions = sum?.institutionOwnership?.ownershipList?.slice(0, 5) ?? [];
              const major    = sum?.majorHoldersBreakdown;
              const upgrades = sum?.upgradeDowngradeHistory?.history?.slice(0, 6) ?? [];
              const earningsDate   = ce?.earnings?.earningsDate?.[0];
              const daysToEarnings = earningsDate ? daysUntil(earningsDate) : null;

              return (
                <Fragment key={s.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => toggleRow(s)}>
                    <td><strong>{s.symbol}</strong>{expandedId === s.id && <span style={{ color: "#555", fontSize: "0.75rem", marginLeft: "0.4rem" }}>▼</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}>{editingId === s.id ? <input type="number" step="any" value={editQty} onChange={(e) => setEditQty(e.target.value)} style={{ width: "80px" }} /> : s.quantity}</td>
                    <td onClick={(e) => e.stopPropagation()}>{editingId === s.id ? <input type="number" step="any" value={editAvgCost} onChange={(e) => setEditAvgCost(e.target.value)} style={{ width: "90px" }} /> : fmt(s.avgCost)}</td>
                    <td>{fmt(s.currentPrice)}{priceArrow(s)}</td>
                    <td>{fmt(s.currentValue)}</td>
                    <td>{s.currentValue != null && totalValue > 0 ? `${((s.currentValue / totalValue) * 100).toFixed(1)}%` : "—"}</td>
                    <td>{fmt(s.costBasis)}</td>
                    <td className={gainColor(s.gainLoss)}>{fmt(s.gainLoss)}</td>
                    <td className={gainColor(s.gainLossPct)}>{s.gainLossPct != null ? `${s.gainLossPct.toFixed(2)}%` : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                      {editingId === s.id ? (
                        <><button className="btn-primary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem", marginRight: "0.4rem" }} onClick={() => saveEdit(s.id)}>Save</button><button className="btn-danger" onClick={() => setEditingId(null)}>Cancel</button></>
                      ) : (
                        <><button className="btn-edit" style={{ marginRight: "0.4rem" }} onClick={() => { setEditingId(s.id); setEditQty(String(s.quantity)); setEditAvgCost(String(s.avgCost)); setExpandedId(null); }}>✏️</button><button className="btn-danger" onClick={() => deleteStock(s.id)}>✕</button></>
                      )}
                    </td>
                  </tr>

                  {expandedId === s.id && (
                    <tr><td colSpan={10} style={{ padding: 0 }}>
                      <div className="detail-card">
                        <div className="tab-bar">
                          {(["stats", "chart", "profile", "news"] as TabKey[]).map((t) => (
                            <button key={t} className={`tab-btn ${tab === t ? "tab-active" : ""}`} onClick={() => switchTab(s.id, t, s.symbol)}>
                              {t === "stats" ? "📊 Stats" : t === "chart" ? "📈 Chart" : t === "profile" ? "🏢 Profile" : "📰 News"}
                            </button>
                          ))}
                        </div>

                        {/* ── STATS TAB ─────────────────────────────────────── */}
                        {tab === "stats" && (
                          <div>
                            {summaryLoading[s.id] && <p style={{ color: "#555" }}>Loading stats…</p>}
                            {!summaryLoading[s.id] && sum && (<>
                              {/* Key metrics */}
                              <div className="detail-grid" style={{ marginBottom: "1.25rem" }}>
                                <div className="detail-item"><span className="detail-label">P/E Ratio</span><span className="detail-value">{sd?.trailingPE?.toFixed(1) ?? "—"}x</span></div>
                                <div className="detail-item"><span className="detail-label">Forward P/E</span><span className="detail-value">{(ks?.forwardPE ?? sd?.forwardPE)?.toFixed(1) ?? "—"}x</span></div>
                                <div className="detail-item"><span className="detail-label">EPS (TTM)</span><span className="detail-value">{fmt(ks?.trailingEps)}</span></div>
                                <div className="detail-item"><span className="detail-label">Revenue Growth</span><span className={`detail-value ${gainColor(fd?.revenueGrowth)}`}>{fmtPct(fd?.revenueGrowth)}</span></div>
                                <div className="detail-item"><span className="detail-label">Profit Margin</span><span className="detail-value">{fmtPct(fd?.profitMargins)}</span></div>
                                <div className="detail-item"><span className="detail-label">Debt / Equity</span><span className="detail-value">{fd?.debtToEquity?.toFixed(2) ?? "—"}</span></div>
                                <div className="detail-item"><span className="detail-label">Dividend Yield</span><span className="detail-value">{sd?.dividendYield ? fmtPct(sd.dividendYield) : "—"}</span></div>
                                <div className="detail-item"><span className="detail-label">Short % Float</span><span className="detail-value">{fmtPct(ks?.shortPercentOfFloat)}</span></div>
                                <div className="detail-item"><span className="detail-label">Insider Held</span><span className="detail-value">{fmtPct(major?.insidersPercentHeld ?? ks?.heldPercentInsiders)}</span></div>
                                <div className="detail-item"><span className="detail-label">Institution Held</span><span className="detail-value">{fmtPct(major?.institutionsPercentHeld ?? ks?.heldPercentInstitutions)}</span></div>
                                <div className="detail-item"><span className="detail-label">Institutions Count</span><span className="detail-value">{major?.institutionsCount?.toLocaleString() ?? "—"}</span></div>
                                <div className="detail-item"><span className="detail-label">Market Cap</span><span className="detail-value">{fmtCompact(s.marketCap)}</span></div>
                              </div>

                              {/* 52W range bar */}
                              {s.fiftyTwoWeekLow != null && s.fiftyTwoWeekHigh != null && s.currentPrice != null && (
                                <div style={{ marginBottom: "1.25rem" }}>
                                  <p className="detail-label" style={{ marginBottom: "0.25rem" }}>52-Week Range</p>
                                  <RangeBar low={s.fiftyTwoWeekLow} high={s.fiftyTwoWeekHigh} current={s.currentPrice} />
                                  <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "0.4rem" }}>
                                    {((s.currentPrice - s.fiftyTwoWeekLow) / (s.fiftyTwoWeekHigh - s.fiftyTwoWeekLow) * 100).toFixed(0)}% of 52W range
                                  </p>
                                </div>
                              )}

                              {/* Analyst price target */}
                              {fd?.targetMeanPrice && (
                                <div style={{ marginBottom: "1.25rem" }}>
                                  <p className="detail-label" style={{ marginBottom: "0.5rem" }}>Analyst Price Target</p>
                                  <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                                    <span style={{ fontSize: "0.85rem", color: "#888" }}>Current: <strong style={{ color: "#e5e5e5" }}>{fmt(s.currentPrice)}</strong></span>
                                    <span style={{ fontSize: "0.85rem", color: "#888" }}>Target: <strong style={{ color: "#4ade80" }}>{fmt(fd.targetMeanPrice)}</strong></span>
                                    {s.currentPrice && <span className={gainColor(fd.targetMeanPrice - s.currentPrice)} style={{ fontSize: "0.85rem", fontWeight: 700 }}>{((fd.targetMeanPrice - s.currentPrice) / s.currentPrice * 100).toFixed(1)}% upside</span>}
                                    {fd.numberOfAnalystOpinions && <span style={{ fontSize: "0.8rem", color: "#555" }}>{fd.numberOfAnalystOpinions} analysts</span>}
                                  </div>
                                  {fd.targetLowPrice && fd.targetHighPrice && <RangeBar low={fd.targetLowPrice} high={fd.targetHighPrice} current={fd.targetMeanPrice} color="#4ade80" />}
                                  {fd.recommendationKey && <div style={{ marginTop: "0.75rem" }}><AnalystBar rec={fd.recommendationKey} /></div>}
                                </div>
                              )}

                              {/* Earnings countdown */}
                              {daysToEarnings != null && daysToEarnings > 0 && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#1a1a0a", border: "1px solid #facc15", borderRadius: "6px", padding: "0.4rem 0.75rem", marginBottom: "1.25rem" }}>
                                  <span>📅</span>
                                  <span style={{ color: "#facc15", fontSize: "0.85rem", fontWeight: 600 }}>Next Earnings: in {daysToEarnings} days ({fmtDate(String(earningsDate))})</span>
                                </div>
                              )}

                              {/* Forward earnings estimates */}
                              {et.length > 0 && (
                                <div style={{ marginBottom: "1.25rem" }}>
                                  <p className="detail-label" style={{ marginBottom: "0.6rem" }}>Forward Earnings Estimates</p>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem" }}>
                                    {et.map((item, idx) => (
                                      <div key={idx} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "0.75rem" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                                          <strong style={{ fontSize: "0.9rem" }}>{item.period ?? "—"}</strong>
                                          <span className={gainColor(item.growth)} style={{ fontSize: "0.8rem" }}>{item.growth != null ? `${(item.growth * 100).toFixed(1)}% growth` : "—"}</span>
                                        </div>
                                        <div style={{ display: "grid", gap: "0.25rem", fontSize: "0.8rem", color: "#aaa" }}>
                                          <span>EPS est: <strong style={{ color: "#e5e5e5" }}>{fmt(item.earningsEstimate?.avg)}</strong> <span style={{ color: "#555" }}>({fmt(item.earningsEstimate?.low)} – {fmt(item.earningsEstimate?.high)})</span></span>
                                          <span>Rev est: <strong style={{ color: "#e5e5e5" }}>{fmtCompact(item.revenueEstimate?.avg)}</strong></span>
                                          <span style={{ color: "#555" }}>{item.earningsEstimate?.numberOfAnalysts ?? "—"} analysts</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Analyst upgrade/downgrade history */}
                              {upgrades.length > 0 && (
                                <div style={{ marginBottom: "1.25rem" }}>
                                  <p className="detail-label" style={{ marginBottom: "0.6rem" }}>Recent Analyst Actions</p>
                                  <div style={{ display: "grid", gap: "0.5rem" }}>
                                    {upgrades.map((u, idx) => {
                                      const actionColor = u.action === "up" ? "#4ade80" : u.action === "down" ? "#f87171" : "#facc15";
                                      return (
                                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "0.65rem 0.75rem" }}>
                                          <div>
                                            <strong style={{ fontSize: "0.85rem" }}>{u.firm ?? "Unknown"}</strong>
                                            <p style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                                              <span style={{ color: "#666" }}>{u.fromGrade ?? "—"}</span>
                                              <span style={{ color: "#555" }}> → </span>
                                              <span style={{ color: actionColor, fontWeight: 600 }}>{u.toGrade ?? "—"}</span>
                                              {u.action && <span style={{ color: "#555" }}> ({u.action})</span>}
                                            </p>
                                          </div>
                                          <span style={{ fontSize: "0.75rem", color: "#555" }}>{u.epochGradeDate ? fmtDate(u.epochGradeDate) : "—"}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Insider + Institutional holders */}
                              {(insiders.length > 0 || institutions.length > 0) && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" }}>
                                  {insiders.length > 0 && (
                                    <div>
                                      <p className="detail-label" style={{ marginBottom: "0.6rem" }}>Recent Insider Holders</p>
                                      <div style={{ display: "grid", gap: "0.5rem" }}>
                                        {insiders.map((h, idx) => (
                                          <div key={idx} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "0.65rem 0.75rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                                              <strong style={{ fontSize: "0.85rem" }}>{h.name ?? "—"}</strong>
                                              <span style={{ fontSize: "0.75rem", color: "#555" }}>{fmtDate(h.latestTransDate || h.positionDirectDate)}</span>
                                            </div>
                                            <p style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.2rem" }}>{h.relation ?? h.transactionDescription ?? "Insider"}</p>
                                            {h.shares != null && <p style={{ fontSize: "0.75rem", color: "#aaa", marginTop: "0.15rem" }}>Shares: {h.shares.toLocaleString()}</p>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {institutions.length > 0 && (
                                    <div>
                                      <p className="detail-label" style={{ marginBottom: "0.6rem" }}>Top Institutional Holders</p>
                                      <div style={{ display: "grid", gap: "0.5rem" }}>
                                        {institutions.map((inst, idx) => (
                                          <div key={idx} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "0.65rem 0.75rem" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                                              <strong style={{ fontSize: "0.85rem" }}>{inst.organization ?? "—"}</strong>
                                              <span style={{ fontSize: "0.75rem", color: "#555" }}>{fmtDate(inst.reportDate)}</span>
                                            </div>
                                            <p style={{ fontSize: "0.75rem", color: "#aaa", marginTop: "0.2rem" }}>Position: {inst.position?.toLocaleString() ?? "—"}</p>
                                            <p style={{ fontSize: "0.75rem", color: "#aaa", marginTop: "0.1rem" }}>Value: {fmtCompact(inst.value)}{inst.pctHeld ? ` · ${(inst.pctHeld * 100).toFixed(2)}% held` : ""}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>)}
                          </div>
                        )}

                        {/* ── CHART TAB ──────────────────────────────────────── */}
                        {tab === "chart" && (
                          <div>
                            {chartLoading && !chartCache[chartKey] && <p style={{ color: "#555" }}>Loading chart…</p>}
                            <SVGChart data={chartCache[chartKey] ?? []} period={period} onPeriodChange={(p) => changePeriod(s.id, s.symbol, p)} />
                          </div>
                        )}

                        {/* ── PROFILE TAB ────────────────────────────────────── */}
                        {tab === "profile" && (
                          <div>
                            {summaryLoading[s.id] && <p style={{ color: "#555" }}>Loading profile…</p>}
                            {!summaryLoading[s.id] && ap && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                                  <div>
                                    <p style={{ fontSize: "0.85rem", color: "#888" }}>Sector: <span style={{ color: "#e5e5e5" }}>{ap.sector ?? "—"}</span></p>
                                    <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" }}>Industry: <span style={{ color: "#e5e5e5" }}>{ap.industry ?? "—"}</span></p>
                                    <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" }}>Employees: <span style={{ color: "#e5e5e5" }}>{ap.fullTimeEmployees?.toLocaleString() ?? "—"}</span></p>
                                    {ap.city && <p style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.25rem" }}>📍 {[ap.city, ap.state, ap.country].filter(Boolean).join(", ")}</p>}
                                  </div>
                                  {ap.website && <a href={ap.website} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", fontSize: "0.85rem", textDecoration: "none" }}>🔗 {ap.website.replace(/^https?:\/\//, "")}</a>}
                                </div>
                                {ap.longBusinessSummary && (
                                  <div>
                                    <p className="detail-label" style={{ marginBottom: "0.5rem" }}>About</p>
                                    <p style={{ fontSize: "0.875rem", color: "#aaa", lineHeight: 1.6 }}>{expandedDesc[s.id] ? ap.longBusinessSummary : ap.longBusinessSummary.slice(0, 300) + "…"}</p>
                                    <button onClick={() => setExpandedDesc((p) => ({ ...p, [s.id]: !p[s.id] }))} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontSize: "0.8rem", marginTop: "0.4rem", padding: 0 }}>
                                      {expandedDesc[s.id] ? "Show less" : "Show more"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {!summaryLoading[s.id] && !ap && <p style={{ color: "#555" }}>No profile data available.</p>}
                          </div>
                        )}

                        {/* ── NEWS TAB ───────────────────────────────────────── */}
                        {tab === "news" && (
                          <div className="news-list">
                            {newsLoading[s.id] && <p className="news-loading">Loading news…</p>}
                            {!newsLoading[s.id] && (newsCache[s.id] ?? []).length === 0 && <p className="news-empty">No news found for {s.symbol}.</p>}
                            {(newsCache[s.id] ?? []).map((item, i) => (
                              <a key={i} href={item.link} target="_blank" rel="noopener noreferrer" className="news-item">
                                {item.thumbnail && <img src={item.thumbnail} alt="" className="news-thumb" />}
                                <div className="news-content">
                                  <p className="news-title">{item.title}</p>
                                  <p className="news-meta"><span className="news-publisher">{item.publisher}</span><span className="news-time">{timeAgo(item.publishedAt)}</span></p>
                                </div>
                              </a>
                            ))}
                          </div>
                        )}

                        <p style={{ color: "#444", fontSize: "0.75rem", marginTop: "1rem" }}>Click row again to collapse</p>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}