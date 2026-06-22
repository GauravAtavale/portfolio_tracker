import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const summary = await yahooFinance.quoteSummary(symbol, {
      modules: ["financialData", "defaultKeyStatistics", "summaryDetail", "assetProfile", "calendarEvents"],
    });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[Summary]", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
