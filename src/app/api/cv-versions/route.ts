import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const offerId = req.nextUrl.searchParams.get("offerId");

  const versions = await prisma.cvVersion.findMany({
    where: { profileId: "singleton", ...(offerId ? { offerId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      label: true,
      offerId: true,
      offerTitle: true,
      offerCompany: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ versions });
}
