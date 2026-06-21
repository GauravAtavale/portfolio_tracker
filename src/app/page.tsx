"use client";
import { useEffect, useState, useCallback, useRef, Fragment } from "react";

type StockRow = {
  id: number;
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  costBasis: number;
  gainLoss: number | null;
  gainLossPct: number | null;
  // Yahoo Finance extra fields
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  regularMarketPreviousClose?: number;
  marketCap?: number;
  regularMarketChangePercent?: number;
};

type Portfolio = {
  stocks: StockRow[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
};

const fmt = (n: number | null | undefined, prefix = "$") =>
  n == null
    ? "—"
    : `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCompact = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return fmt(n);
};

export default function Home() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editAvgCost, setEditAvgCost] = useState("");
  const prevPrices = useRef<Record<number, number | null>>({});

  const fetchPortfolio = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/portfolio");
      const data: Portfolio = await res.json();
      // store previous prices before updating
      setPortfolio((prev) => {
        if (prev) {
          const map: Record<number, number | null> = {};
          prev.stocks.forEach((s) => { map[s.id] = s.currentPrice; });
          prevPrices.current = map;
        }
        return data;
      });
      setLastUpdated(new Date());
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30_000);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // seconds-ago ticker
  useEffect(() => {
    const tick = setInterval(() => {
      if (lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  async function addStock(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, quantity: +quantity, avgCost: +avgCost }),
    });
    setSymbol(""); setQuantity(""); setAvgCost("");
    await fetchPortfolio();
    setLoading(false);
  }

  async function deleteStock(id: number) {
    await fetch(`/api/stocks/${id}`, { method: "DELETE" });
    await fetchPortfolio();
  }

  async function saveEdit(id: number) {
    await fetch("/api/stocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: portfolio!.stocks.find((s) => s.id === id)!.symbol,
        quantity: +editQty,
        avgCost: +editAvgCost,
      }),
    });
    setEditingId(null);
    await fetchPortfolio();
  }

  const gainColor = (v: number | null | undefined) =>
    v == null ? "" : v >= 0 ? "positive" : "negative";

  const priceArrow = (s: StockRow) => {
    const prev = prevPrices.current[s.id];
    if (prev == null || s.currentPrice == null) return null;
    if (s.currentPrice > prev) return <span style={{ color: "#4ade80" }}> ▲</span>;
    if (s.currentPrice < prev) return <span style={{ color: "#f87171" }}> ▼</span>;
    return null;
  };

  if (!mounted) return null;

  const totalValue = portfolio?.totalValue ?? 0;

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>📈 Portfolio Tracker</h1>
          <p style={{ color: "#888", marginBottom: "1rem" }}>
            Track your stock holdings and net worth in real time
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {lastUpdated && (
            <span style={{ color: "#888", fontSize: "0.85rem" }}>
              Last updated: {secondsAgo}s ago
            </span>
          )}
          <button
            className="btn-primary"
            onClick={fetchPortfolio}
            disabled={fetching}
            style={{ padding: "0.4rem 0.9rem", fontSize: "0.85rem" }}
          >
            {fetching ? "⏳" : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {portfolio && (
        <div className="card">
          <p style={{ color: "#888", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Net Worth
          </p>
          <p className="net-worth">
            {fetching ? "Updating…" : fmt(portfolio.totalValue)}
          </p>
          <p className="subtitle">
            Cost Basis: {fmt(portfolio.totalCost)}&nbsp;&nbsp;|&nbsp;&nbsp;
            <span className={gainColor(portfolio.totalGainLoss)}>
              Total P&amp;L: {fmt(portfolio.totalGainLoss)}
              {portfolio.totalCost > 0 &&
                ` (${((portfolio.totalGainLoss / portfolio.totalCost) * 100).toFixed(2)}%)`}
            </span>
          </p>
        </div>
      )}

      <form onSubmit={addStock}>
        <label>
          Ticker Symbol
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="AAPL"
            required
          />
        </label>
        <label>
          Quantity
          <input
            type="number" min="0.0001" step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="10" required
          />
        </label>
        <label>
          Avg Cost ($)
          <input
            type="number" min="0.0001" step="any"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder="150.00" required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={loading} style={{ alignSelf: "flex-end" }}>
          {loading ? "Adding…" : "Add / Update Stock"}
        </button>
      </form>

      {fetching && !portfolio && (
        <div className="empty"><p>Loading portfolio…</p></div>
      )}

      {!fetching && portfolio?.stocks.length === 0 && (
        <div className="empty">
          <p>No stocks yet.</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Add your first holding above ↑</p>
        </div>
      )}

      {portfolio && portfolio.stocks.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg Cost</th>
              <th>Live Price</th>
              <th>Market Value</th>
              <th>Allocation</th>
              <th>Cost Basis</th>
              <th>P&amp;L ($)</th>
              <th>P&amp;L (%)</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.stocks.map((s) => (
              <Fragment key={s.id}>
                <tr
                  key={s.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (editingId !== s.id) setExpandedId(expandedId === s.id ? null : s.id);
                  }}
                >
                  <td><strong>{s.symbol}</strong></td>

                  {/* Qty — editable */}
                  <td onClick={(e) => e.stopPropagation()}>
                    {editingId === s.id ? (
                      <input
                        type="number" step="any" value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        style={{ width: "80px" }}
                      />
                    ) : s.quantity}
                  </td>

                  {/* Avg Cost — editable */}
                  <td onClick={(e) => e.stopPropagation()}>
                    {editingId === s.id ? (
                      <input
                        type="number" step="any" value={editAvgCost}
                        onChange={(e) => setEditAvgCost(e.target.value)}
                        style={{ width: "90px" }}
                      />
                    ) : fmt(s.avgCost)}
                  </td>

                  <td>{fmt(s.currentPrice)}{priceArrow(s)}</td>
                  <td>{fmt(s.currentValue)}</td>

                  {/* Allocation % */}
                  <td>
                    {s.currentValue != null && totalValue > 0
                      ? `${((s.currentValue / totalValue) * 100).toFixed(1)}%`
                      : "—"}
                  </td>

                  <td>{fmt(s.costBasis)}</td>
                  <td className={gainColor(s.gainLoss)}>{fmt(s.gainLoss)}</td>
                  <td className={gainColor(s.gainLossPct)}>
                    {s.gainLossPct != null ? `${s.gainLossPct.toFixed(2)}%` : "—"}
                  </td>

                  {/* Actions */}
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                    {editingId === s.id ? (
                      <>
                        <button
                          className="btn-primary"
                          style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem", marginRight: "0.4rem" }}
                          onClick={() => saveEdit(s.id)}
                        >
                          Save
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-edit"
                          style={{ marginRight: "0.4rem" }}
                          onClick={() => {
                            setEditingId(s.id);
                            setEditQty(String(s.quantity));
                            setEditAvgCost(String(s.avgCost));
                            setExpandedId(null);
                          }}
                        >
                          ✏️
                        </button>
                        <button className="btn-danger" onClick={() => deleteStock(s.id)}>✕</button>
                      </>
                    )}
                  </td>
                </tr>

                {/* Expanded detail card */}
                {expandedId === s.id && (
                  <tr key={`${s.id}-detail`}>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <div className="detail-card">
                        <div className="detail-grid">
                          <div className="detail-item">
                            <span className="detail-label">Day High</span>
                            <span className="detail-value">{fmt(s.regularMarketDayHigh)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Day Low</span>
                            <span className="detail-value">{fmt(s.regularMarketDayLow)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Prev Close</span>
                            <span className="detail-value">{fmt(s.regularMarketPreviousClose)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Day Change</span>
                            <span className={`detail-value ${gainColor(s.regularMarketChangePercent)}`}>
                              {s.regularMarketChangePercent != null
                                ? `${s.regularMarketChangePercent.toFixed(2)}%`
                                : "—"}
                            </span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">52W High</span>
                            <span className="detail-value">{fmt(s.fiftyTwoWeekHigh)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">52W Low</span>
                            <span className="detail-value">{fmt(s.fiftyTwoWeekLow)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Market Cap</span>
                            <span className="detail-value">{fmtCompact(s.marketCap)}</span>
                          </div>
                          <div className="detail-item">
                            <span className="detail-label">Holdings Value</span>
                            <span className="detail-value">{fmt(s.currentValue)}</span>
                          </div>
                        </div>
                        <p style={{ color: "#555", fontSize: "0.75rem", marginTop: "0.75rem" }}>
                          Click row again to collapse
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
