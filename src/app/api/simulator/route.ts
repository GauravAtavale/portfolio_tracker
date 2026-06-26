import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance();

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol    = searchParams.get("symbol")?.toUpperCase();
  const entryDate = searchParams.get("entryDate");
  const shares    = parseFloat(searchParams.get("shares") ?? "1");

  if (!symbol || !entryDate) {
    return NextResponse.json({ error: "symbol and entryDate required" }, { status: 400 });
  }

  const entryDt    = new Date(entryDate);
  const today      = new Date();
  const period2    = fmtDate(today);
  const period1Pre = fmtDate(new Date(entryDt.getTime() - 7 * 86400000));

  try {
    const [stockHistory, spyHistory, summaryRaw, newsRaw] = await Promise.allSettled([
      yf.historical(symbol, { period1: period1Pre, period2, interval: "1d" }, { validateResult: false }),
      yf.historical("SPY",  { period1: period1Pre, period2, interval: "1d" }, { validateResult: false }),
      yf.quoteSummary(symbol, { modules: ["financialData", "assetProfile", "summaryDetail"] }, { validateResult: false }),
      yf.search(symbol, { newsCount: 15, quotesCount: 0 }, { validateResult: false }),
    ]);

    const stock = stockHistory.status === "fulfilled" ? stockHistory.value : [];
    const spy   = spyHistory.status   === "fulfilled" ? spyHistory.value   : [];

    const entryRow = stock.find((h) => new Date(h.date) >= entryDt) ?? stock[0];
    if (!entryRow) {
      return NextResponse.json({ error: "No price data found for that date. Try a different date." }, { status: 404 });
    }

    const actualEntryDate = fmtDate(new Date(entryRow.date));
    const entryPrice      = entryRow.open ?? entryRow.close;
    const currentRow      = stock[stock.length - 1];
    const currentPrice    = currentRow?.close ?? entryPrice;
    const entryDtActual   = new Date(actualEntryDate);

    const stockFrom = stock.filter((h) => new Date(h.date) >= entryDtActual);
    const spyFrom   = spy.filter((h)   => new Date(h.date) >= entryDtActual);

    const spyEntryPrice = spyFrom[0]?.close ?? 1;
    const chartData = stockFrom.map((h, i) => {
      const stockVal = (h.close / entryPrice) * (entryPrice * shares);
      const spyClose = spyFrom[i]?.close ?? spyEntryPrice;
      const spyVal   = (spyClose / spyEntryPrice) * (entryPrice * shares);
      return {
        date: fmtDate(new Date(h.date)),
        portfolioValue: +stockVal.toFixed(2),
        spyValue: +spyVal.toFixed(2),
        stockPrice: +h.close.toFixed(2),
      };
    });

    const costBasis    = entryPrice * shares;
    const currentValue = currentPrice * shares;
    const gainLoss     = currentValue - costBasis;
    const gainLossPct  = (gainLoss / costBasis) * 100;
    const daysHeld     = Math.round((today.getTime() - entryDtActual.getTime()) / 86400000);
    const years        = daysHeld / 365;
    const cagr         = years > 0.01 ? ((Math.pow(currentValue / costBasis, 1 / years) - 1) * 100) : 0;

    const spyEntry   = spyFrom[0]?.close ?? 1;
    const spyCurrent = spyFrom[spyFrom.length - 1]?.close ?? spyEntry;
    const spyReturn  = ((spyCurrent - spyEntry) / spyEntry) * 100;
    const alpha      = gainLossPct - spyReturn;

    let peak = entryPrice, maxDrawdown = 0;
    for (const h of stockFrom) {
      if (h.close > peak) peak = h.close;
      const dd = ((h.close - peak) / peak) * 100;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }

    const prices     = stockFrom.map((h) => h.close);
    const bestPrice  = prices.length ? Math.max(...prices) : entryPrice;
    const worstPrice = prices.length ? Math.min(...prices) : entryPrice;

    const snap = (days: number) => {
      const target = new Date(entryDtActual.getTime() + days * 86400000);
      const row = stockFrom.find((h) => new Date(h.date) >= target);
      return row
        ? { price: +row.close.toFixed(2), value: +(row.close * shares).toFixed(2), date: fmtDate(new Date(row.date)) }
        : null;
    };

    const newsItems = newsRaw.status === "fulfilled"
      ? (newsRaw.value.news ?? []).map((n: {
          title?: string; link?: string; publisher?: string;
          providerPublishTime?: Date | string | number;
          thumbnail?: { resolutions?: { url: string }[] };
        }) => ({
          title: n.title, link: n.link, publisher: n.publisher,
          publishedAt: n.providerPublishTime,
          thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
        }))
      : [];

    const spyWeek = spyFrom.slice(0, 5);
    const spyLow  = spyWeek.length ? Math.min(...spyWeek.map((h) => h.close)) : 0;
    const spyHigh = spyWeek.length ? Math.max(...spyWeek.map((h) => h.close)) : 0;
    const spyVolatilityPct = spyLow > 0 ? ((spyHigh - spyLow) / spyLow) * 100 : 0;

    const summary = summaryRaw.status === "fulfilled" ? summaryRaw.value : {};

    return NextResponse.json({
      symbol, shares, actualEntryDate,
      entryPrice: +entryPrice.toFixed(2),
      currentPrice: +currentPrice.toFixed(2),
      costBasis: +costBasis.toFixed(2),
      currentValue: +currentValue.toFixed(2),
      gainLoss: +gainLoss.toFixed(2),
      gainLossPct: +gainLossPct.toFixed(2),
      cagr: +cagr.toFixed(2),
      daysHeld,
      spyReturn: +spyReturn.toFixed(2),
      alpha: +alpha.toFixed(2),
      maxDrawdown: +maxDrawdown.toFixed(2),
      bestPrice: +bestPrice.toFixed(2),
      worstPrice: +worstPrice.toFixed(2),
      snapshots: { d7: snap(7), d30: snap(30), d90: snap(90) },
      chartData,
      news: newsItems,
      marketContext: {
        spyReturn: +spyReturn.toFixed(2),
        spyVolatilityPct: +spyVolatilityPct.toFixed(2),
        sector: (summary as { assetProfile?: { sector?: string } }).assetProfile?.sector ?? null,
        recommendation: (summary as { financialData?: { recommendationKey?: string } }).financialData?.recommendationKey ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Simulator]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { symbol, entryDate, shares, entryPrice, currentPrice, gainLossPct, cagr, daysHeld, alpha, tags, note } = body;
  const sim = await prisma.simulation.create({
    data: {
      symbol: symbol.toUpperCase(),
      entryDate: new Date(entryDate),
      shares: Number(shares),
      entryPrice: Number(entryPrice),
      currentPrice: Number(currentPrice),
      gainLossPct: Number(gainLossPct),
      cagr: Number(cagr),
      daysHeld: Number(daysHeld),
      alpha: Number(alpha),
      tags: JSON.stringify(tags ?? []),
      note: note ?? null,
    },
  });
  return NextResponse.json(sim, { status: 201 });
}