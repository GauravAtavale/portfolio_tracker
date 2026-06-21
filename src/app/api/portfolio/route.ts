import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import yahooFinance from "yahoo-finance2";

export async function GET() {
  const stocks = await prisma.stock.findMany();

  const enriched = await Promise.all(
    stocks.map(async (s) => {
      try {
        const quote = await yahooFinance.quote(s.symbol);
        const currentPrice = quote.regularMarketPrice ?? 0;
        const currentValue = currentPrice * s.quantity;
        const costBasis = s.avgCost * s.quantity;
        const gainLoss = currentValue - costBasis;
        const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
        return { ...s, currentPrice, currentValue, costBasis, gainLoss, gainLossPct };
      } catch {
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
