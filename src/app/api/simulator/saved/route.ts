import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const sims = await prisma.simulation.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(sims.map((s) => ({ ...s, tags: JSON.parse(s.tags ?? "[]") })));
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  await prisma.simulation.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}