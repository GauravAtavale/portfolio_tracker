import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import yahooFinance from "@/lib/yahooFinance";

export async function GET() {
  const stocks = await prisma.stock.findMany();

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      try {
        const quote = await yahooFinance.quote(s.symbol, {}, { validateResult: false });
        const currentPrice = quote.regularMarketPrice ?? null;
        const currentValue = currentPrice != null ? currentPrice * s.quantity : null;
        const costBasis = s.avgCost * s.quantity;
        const gainLoss = currentValue != null ? currentValue - costBasis : null;
        const gainLossPct = gainLoss != null && costBasis > 0 ? (gainLoss / costBasis) * 100 : null;
        return { ...s, currentPrice, currentValue, costBasis, gainLoss, gainLossPct };
      } catch (err) {
        console.error(`[Yahoo Finance] Failed to fetch ${s.symbol}:`, err);
        return {
          ...s,
          currentPrice: null,
          currentValue: null,
          costBasis: s.avgCost * s.quantity,
          gainLoss: null,
          gainLossPct: null,
        };
      }
    })
  );

  const totalValue = enriched.reduce((sum, s) => sum + (s.currentValue ?? 0), 0);
  const totalCost = enriched.reduce((sum, s) => sum + s.costBasis, 0);
  const totalGainLoss = totalValue - totalCost;

  return NextResponse.json({ stocks: enriched, totalValue, totalCost, totalGainLoss });
}