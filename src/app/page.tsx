"use client";
import { useEffect, useState, useCallback } from "react";

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
};

type Portfolio = {
  stocks: StockRow[];
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
};

const fmt = (n: number | null, prefix = "$") =>
  n == null
    ? "—"
    : `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Home() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fetchPortfolio = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/portfolio");
      setPortfolio(await res.json());
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchPortfolio();
    const interval = setInterval(fetchPortfolio, 30_000); // refresh every 30s
    return () => clearInterval(interval); // stop when page closes
  }, [fetchPortfolio]);

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

  const gainColor = (v: number | null) =>
    v == null ? "" : v >= 0 ? "positive" : "negative";

  if (!mounted) return null;

  return (
    <main>
      <h1>📈 Portfolio Tracker</h1>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>
        Track your stock holdings and net worth in real time
      </p>

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
            type="number"
            min="0.0001"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="10"
            required
          />
        </label>
        <label>
          Avg Cost ($)
          <input
            type="number"
            min="0.0001"
            step="any"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder="150.00"
            required
          />
        </label>
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ alignSelf: "flex-end" }}
        >
          {loading ? "Adding…" : "Add / Update Stock"}
        </button>
      </form>

      {fetching && !portfolio && (
        <div className="empty"><p>Loading portfolio…</p></div>
      )}

      {!fetching && portfolio?.stocks.length === 0 && (
        <div className="empty">
          <p>No stocks yet.</p>
          <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
            Add your first holding above ↑
          </p>
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
              <th>Cost Basis</th>
              <th>P&amp;L ($)</th>
              <th>P&amp;L (%)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {portfolio.stocks.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.symbol}</strong></td>
                <td>{s.quantity}</td>
                <td>{fmt(s.avgCost)}</td>
                <td>{fmt(s.currentPrice)}</td>
                <td>{fmt(s.currentValue)}</td>
                <td>{fmt(s.costBasis)}</td>
                <td className={gainColor(s.gainLoss)}>{fmt(s.gainLoss)}</td>
                <td className={gainColor(s.gainLossPct)}>
                  {s.gainLossPct != null ? `${s.gainLossPct.toFixed(2)}%` : "—"}
                </td>
                <td>
                  <button className="btn-danger" onClick={() => deleteStock(s.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}