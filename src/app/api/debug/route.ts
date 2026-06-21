import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";   // ✅ new

export async function GET() {
  try {
    const quote = await yahooFinance.quote("BTC-USD", {}, { validateResult: false });
    return NextResponse.json(quote);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}