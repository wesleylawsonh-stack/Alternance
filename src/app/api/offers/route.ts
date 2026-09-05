import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeMatch } from "@/lib/matching";
import { asStringArray, toJsonString } from "@/lib/json";
import { serializeOffer } from "@/lib/serialize";

export async function GET() {
  const offers = await prisma.offer.findMany({
    orderBy: [{ matchScore: "desc" }, { fetchedAt: "desc" }],
  });
  return NextResponse.json({ offers: offers.map(serializeOffer) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (!title || !description) {
    return NextResponse.json({ error: "Titre et description sont obligatoires." }, { status: 400 });
  }

  const [profile, criteria] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
  ]);

  const cvSkills = asStringArray(profile?.cvSkills);
  const keywords = asStringArray(criteria?.keywords);
  const match = computeMatch(cvSkills, description, keywords, profile?.cvRawText ?? "");

  const offer = await prisma.offer.create({
    data: {
      title,
      company: typeof body.company === "string" ? body.company.trim() || null : null,
      location: typeof body.location === "string" ? body.location.trim() || null : null,
      url: typeof body.url === "string" ? body.url.trim() || null : null,
      description,
      contractType: typeof body.contractType === "string" ? body.contractType.trim() || null : null,
      source: "manual",
      requiredSkills: toJsonString(match.requiredSkills),
      matchedSkills: toJsonString(match.matchedSkills),
      missingSkills: toJsonString(match.missingSkills),
      matchScore: match.score,
    },
  });

  return NextResponse.json({ offer: serializeOffer(offer) }, { status: 201 });
}
