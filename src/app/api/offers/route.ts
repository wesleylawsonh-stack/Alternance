import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "@/lib/matching";
import { asStringArray, asObject } from "@/lib/json";
import { serializeOffer } from "@/lib/serialize";
import { computeOfferContentHash } from "@/lib/contentHash";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const minScore = params.get("minScore");
  const company = params.get("company");
  const location = params.get("location");
  const status = params.get("status");
  const source = params.get("source");
  const postedAfter = params.get("postedAfter");
  const hideLowMatch = params.get("hideLowMatch") === "true";

  // Chaque filtre "OR" (date, recommandation) est pousse comme sa propre
  // entree d'un tableau AND plutot que d'ecrire directement where.OR, pour
  // pouvoir combiner plusieurs filtres a base de OR sans qu'ils s'ecrasent.
  const and: Record<string, unknown>[] = [];

  if (minScore) and.push({ matchScore: { gte: Number(minScore) } });
  if (company) and.push({ company: { contains: company, mode: "insensitive" } });
  if (location) and.push({ location: { contains: location, mode: "insensitive" } });
  if (source && source !== "ALL") and.push({ source });

  // "ACTIVE" (valeur par defaut cote UI) masque les offres refusees/ignorees
  // (le bouton "Ignorer" et un refus detecte via Gmail utilisent tous deux
  // le statut REJECTED) sans imposer un statut precis comme le ferait un
  // filtre exact.
  if (status === "ACTIVE") and.push({ applicationStatus: { not: "REJECTED" } });
  else if (status && status !== "ALL") and.push({ applicationStatus: status });

  if (postedAfter) {
    const date = new Date(postedAfter);
    if (!isNaN(date.getTime())) {
      // Filtre sur la date de publication quand elle est connue, sinon sur
      // la date de recuperation (offres ajoutees manuellement sans date).
      and.push({ OR: [{ postedAt: { gte: date } }, { AND: [{ postedAt: null }, { fetchedAt: { gte: date } }] }] });
    }
  }

  if (hideLowMatch) {
    // "not: IGNORER" exclurait aussi les offres sans recommandation encore
    // calculee (NULL) a cause de la logique ternaire SQL : on les garde
    // explicitement visibles plutot que de les masquer par erreur.
    and.push({ OR: [{ recommendation: { not: "IGNORER" } }, { recommendation: null }] });
  }

  const where = and.length > 0 ? { AND: and } : {};

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

  const company = typeof body.company === "string" ? body.company.trim() || null : null;

  const offer = await prisma.offer.create({
    data: {
      title,
      company,
      location,
      url: typeof body.url === "string" ? body.url.trim() || null : null,
      description,
      contractType,
      source: "manual",
      contentHash: computeOfferContentHash(title, company, description),
      ...matchResultToOfferData(match),
    },
  });

  return NextResponse.json({ offer: serializeOffer(offer) }, { status: 201 });
}
