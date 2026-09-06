import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recomputeAllOfferScores } from "@/lib/recompute";
import { toJsonString } from "@/lib/json";
import { serializeCriteria } from "@/lib/serialize";

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim());
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export async function GET() {
  const criteria = await prisma.criteria.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ criteria: serializeCriteria(criteria) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const data = {
    jobTitles: toJsonString(toStringArray(body.jobTitles)),
    locations: toJsonString(toStringArray(body.locations)),
    contractTypes: toJsonString(toStringArray(body.contractTypes)),
    remote: Boolean(body.remote),
    keywords: toJsonString(toStringArray(body.keywords)),
    excludeKeywords: toJsonString(toStringArray(body.excludeKeywords)),
    minSalary: body.minSalary ? Number(body.minSalary) : null,
    radiusKm: body.radiusKm ? Number(body.radiusKm) : null,
    searchDescription: typeof body.searchDescription === "string" ? body.searchDescription.trim() || null : null,
    autoFetchEnabled: body.autoFetchEnabled === undefined ? true : Boolean(body.autoFetchEnabled),
    emailDigestEnabled: Boolean(body.emailDigestEnabled),
  };

  const criteria = await prisma.criteria.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  const updatedOffers = await recomputeAllOfferScores();

  return NextResponse.json({ criteria: serializeCriteria(criteria), updatedOffers });
}
