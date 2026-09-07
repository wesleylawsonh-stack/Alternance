import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeOffer } from "@/lib/serialize";

const VALID_STATUSES = ["NOT_APPLIED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await prisma.offer.findUnique({ where: { id } });
  if (!offer) return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  return NextResponse.json({ offer: serializeOffer(offer) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const data: { applicationStatus?: string; comments?: string | null } = {};
  if (typeof body.applicationStatus === "string") {
    if (!VALID_STATUSES.includes(body.applicationStatus)) {
      return NextResponse.json({ error: "Statut de candidature invalide." }, { status: 400 });
    }
    data.applicationStatus = body.applicationStatus;
  }
  if (typeof body.comments === "string") {
    data.comments = body.comments;
  }

  try {
    const offer = await prisma.offer.update({ where: { id }, data });
    return NextResponse.json({ offer: serializeOffer(offer) });
  } catch {
    return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.offer.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  }
}
