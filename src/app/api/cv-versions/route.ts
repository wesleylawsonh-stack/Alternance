import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const versions = await prisma.cvVersion.findMany({
    where: { profileId: "singleton" },
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
