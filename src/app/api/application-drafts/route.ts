import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const drafts = await prisma.applicationDraft.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      offer: {
        select: { id: true, title: true, company: true, companyLogoUrl: true, location: true, matchScore: true },
      },
    },
  });

  return NextResponse.json({ drafts });
}
