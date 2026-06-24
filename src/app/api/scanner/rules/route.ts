import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST  — create a rule
export async function POST(req: Request) {
  const { symbol, condition, threshold } = await req.json();
  if (!symbol || !condition || threshold == null)
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const rule = await prisma.alertRule.create({
    data: { symbol: symbol.toUpperCase(), condition, threshold: Number(threshold), enabled: true },
  });
  return NextResponse.json(rule, { status: 201 });
}

// PATCH — toggle enabled / update threshold
export async function PATCH(req: Request) {
  const { id, enabled, threshold } = await req.json();
  const rule = await prisma.alertRule.update({
    where: { id: Number(id) },
    data: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(threshold !== undefined ? { threshold: Number(threshold) } : {}),
    },
  });
  return NextResponse.json(rule);
}

// DELETE — remove a rule
export async function DELETE(req: Request) {
  const { id } = await req.json();
  await prisma.alertRule.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}