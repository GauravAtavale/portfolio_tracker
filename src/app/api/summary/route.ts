import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const summary = await yf.quoteSummary(
      symbol,
      {
        modules: [
          "financialData",
          "defaultKeyStatistics",
          "summaryDetail",
          "assetProfile",
          "calendarEvents",
          "earningsTrend",
          "insiderHolders",
          "institutionOwnership",
          "majorHoldersBreakdown",
          "upgradeDowngradeHistory",
        ],
      },
      { validateResult: false }
    );
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Summary]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}