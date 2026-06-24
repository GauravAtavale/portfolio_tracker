import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import yahooFinance from "@/lib/yahooFinance";

export async function GET() {
  const tickers = await prisma.watchlistTicker.findMany({
    include: { rules: true },
    orderBy: { createdAt: "asc" },
  });

  const enriched = await Promise.all(
    tickers.map(async (t) => {
      try {
        const q = await yahooFinance.quote(t.symbol, {}, { validateResult: false });
        const change   = q.regularMarketChangePercent ?? 0;
        const price    = q.regularMarketPrice ?? 0;
        const prevClose = q.regularMarketPreviousClose ?? price;
        const volume   = q.regularMarketVolume ?? 0;
        const avgVol   = q.averageDailyVolume10Day ?? 1;
        const low52    = q.fiftyTwoWeekLow ?? 0;
        const high52   = q.fiftyTwoWeekHigh ?? 0;
        const openGapPct = prevClose > 0
          ? (((q.regularMarketOpen ?? price) - prevClose) / prevClose) * 100
          : 0;
        const volMultiple = avgVol > 0 ? volume / avgVol : 0;

        // Evaluate which alert rules are firing
        const firedRules = t.rules.filter((r) => {
          if (!r.enabled) return false;
          switch (r.condition) {
            case "drop":    return change <= -r.threshold;
            case "spike":   return change >= r.threshold;
            case "volume":  return volMultiple >= r.threshold;
            case "52wLow":  return low52 > 0 && price <= low52 * (1 + r.threshold / 100);
            case "gapDown": return openGapPct <= -r.threshold;
            default:        return false;
          }
        });

        return {
          id: t.id,
          symbol: t.symbol,
          note: t.note,
          rules: t.rules,
          firedRules,
          price,
          change,
          openGapPct,
          volMultiple,
          volume,
          avgVol,
          low52,
          high52,
          prevClose,
          marketCap: q.marketCap ?? null,
          name: q.shortName ?? q.longName ?? t.symbol,
          regularMarketOpen: q.regularMarketOpen ?? null,
          regularMarketDayHigh: q.regularMarketDayHigh ?? null,
          regularMarketDayLow: q.regularMarketDayLow ?? null,
          targetMeanPrice: null, // populated by /api/summary if needed
        };
      } catch (err) {
        console.error(`[Scanner] Failed ${t.symbol}:`, err);
        return {
          id: t.id, symbol: t.symbol, note: t.note,
          rules: t.rules, firedRules: [],
          price: null, change: null, openGapPct: null,
          volMultiple: null, volume: null, avgVol: null,
          low52: null, high52: null, prevClose: null,
          marketCap: null, name: t.symbol,
          regularMarketOpen: null, regularMarketDayHigh: null,
          regularMarketDayLow: null, targetMeanPrice: null,
        };
      }
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const { symbol, note } = await req.json();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  const ticker = await prisma.watchlistTicker.upsert({
    where: { symbol: symbol.toUpperCase() },
    update: { note: note ?? null },
    create: { symbol: symbol.toUpperCase(), note: note ?? null },
    include: { rules: true },
  });
  return NextResponse.json(ticker, { status: 201 });
}

export async function DELETE(req: Request) {
  const { symbol } = await req.json();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  await prisma.watchlistTicker.delete({ where: { symbol: symbol.toUpperCase() } });
  return NextResponse.json({ ok: true });
}