import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

function getPeriodConfig(period: string): { period1: string; interval: "1m" | "5m" | "1d" | "1wk" } {
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const daysAgo = (n: number) => {
    const d = new Date(now.getTime() - n * 86400000);
    return fmt(d);
  };

  switch (period) {
    case "1D":
      // intraday: last 1 day, 5-min intervals
      return { period1: today, interval: "5m" };
    case "YTD":
      // Jan 1 of current year
      return { period1: `${now.getFullYear()}-01-01`, interval: "1d" };
    case "1W":
      return { period1: daysAgo(7), interval: "1d" };
    case "1M":
      return { period1: daysAgo(30), interval: "1d" };
    case "3M":
      return { period1: daysAgo(90), interval: "1d" };
    case "6M":
      return { period1: daysAgo(180), interval: "1wk" };
    case "1Y":
      return { period1: daysAgo(365), interval: "1wk" };
    default:
      return { period1: daysAgo(30), interval: "1d" };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const period = searchParams.get("period") ?? "1M";
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const { period1, interval } = getPeriodConfig(period);
    const period2 = new Date().toISOString().split("T")[0];

    const history = await yf.historical(symbol, {
      period1,
      period2,
      interval,
    }, { validateResult: false });

    if (!history || history.length === 0) {
      return NextResponse.json({ data: [], debug: `empty for ${symbol} ${period}` });
    }

    const data = history
      .filter((h) => h.close != null)
      .map((h) => ({
        // For 1D intraday keep time, otherwise just date
        date: period === "1D"
          ? new Date(h.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
          : new Date(h.date).toISOString().split("T")[0],
        close: h.close,
      }));

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Chart] Error:", message);
    return NextResponse.json({ data: [], error: message });
  }
}
