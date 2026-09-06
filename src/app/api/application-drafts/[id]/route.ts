import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: { messageText?: string; status?: string } = {};
  if (typeof body.messageText === "string") data.messageText = body.messageText;
  if (body.status === "DISMISSED") data.status = "DISMISSED";

  try {
    const draft = await prisma.applicationDraft.update({ where: { id }, data });
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ error: "Candidature preparee introuvable." }, { status: 404 });
  }
}
