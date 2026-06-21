import { NextResponse } from "next/server";
import yahooFinance from "@/lib/yahooFinance";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const results = await yahooFinance.search(symbol, { newsCount: 10, quotesCount: 0 });
    const news = (results.news ?? []).map((n: {
      title?: string;
      link?: string;
      publisher?: string;
      providerPublishTime?: Date | string | number;
      thumbnail?: { resolutions?: { url: string }[] };
    }) => ({
      title: n.title,
      link: n.link,
      publisher: n.publisher,
      publishedAt: n.providerPublishTime,
      thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
    }));
    return NextResponse.json({ news });
  } catch (err) {
    console.error("[News] Failed:", err);
    return NextResponse.json({ news: [] });
  }
}
