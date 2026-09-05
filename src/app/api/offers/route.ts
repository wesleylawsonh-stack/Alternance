import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "@/lib/matching";
import { asStringArray, asObject } from "@/lib/json";
import { serializeOffer } from "@/lib/serialize";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const minScore = params.get("minScore");
  const company = params.get("company");
  const location = params.get("location");
  const status = params.get("status");
  const source = params.get("source");
  const postedAfter = params.get("postedAfter");

  const where: Record<string, unknown> = {};
  if (minScore) where.matchScore = { gte: Number(minScore) };
  if (company) where.company = { contains: company, mode: "insensitive" };
  if (location) where.location = { contains: location, mode: "insensitive" };
  if (status && status !== "ALL") where.applicationStatus = status;
  if (source && source !== "ALL") where.source = source;
  if (postedAfter) {
    const date = new Date(postedAfter);
    if (!isNaN(date.getTime())) {
      // Filtre sur la date de publication quand elle est connue, sinon sur
      // la date de recuperation (offres ajoutees manuellement sans date).
      where.OR = [{ postedAt: { gte: date } }, { AND: [{ postedAt: null }, { fetchedAt: { gte: date } }] }];
    }
  }

  const offers = await prisma.offer.findMany({
    where,
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

  const contractType = typeof body.contractType === "string" ? body.contractType.trim() || null : null;
  const location = typeof body.location === "string" ? body.location.trim() || null : null;

  const cvSkills = asStringArray(profile?.cvSkills);
  const cvEducationText = asObject(profile?.cvSections, EMPTY_SECTIONS).education.join(" ");
  const match = await computeWeightedMatch(
    cvSkills,
    profile?.cvRawText ?? "",
    cvEducationText,
    { contractType, location, description },
    buildMatchCriteria(criteria)
  );

  const offer = await prisma.offer.create({
    data: {
      title,
      company: typeof body.company === "string" ? body.company.trim() || null : null,
      location,
      url: typeof body.url === "string" ? body.url.trim() || null : null,
      description,
      contractType,
      source: "manual",
      ...matchResultToOfferData(match),
    },
  });

  return NextResponse.json({ offer: serializeOffer(offer) }, { status: 201 });
}
