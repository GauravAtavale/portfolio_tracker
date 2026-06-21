import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const stocks = await prisma.stock.findMany({ orderBy: { symbol: "asc" } });
  return NextResponse.json(stocks);
}

export async function POST(req: Request) {
  const { symbol, quantity, avgCost } = await req.json();
  if (!symbol || !quantity || !avgCost) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const stock = await prisma.stock.upsert({
    where: { symbol: symbol.toUpperCase() },
    update: { quantity: Number(quantity), avgCost: Number(avgCost) },
    create: {
      symbol: symbol.toUpperCase(),
      quantity: Number(quantity),
      avgCost: Number(avgCost),
    },
  });
  return NextResponse.json(stock, { status: 201 });
}
