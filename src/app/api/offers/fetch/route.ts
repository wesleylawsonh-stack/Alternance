import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "@/lib/matching";
import { asStringArray, asObject } from "@/lib/json";
import { fetchFranceTravailOffers, isFranceTravailConfigured } from "@/lib/franceTravail";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

export async function POST() {
  if (!isFranceTravailConfigured()) {
    return NextResponse.json(
      {
        error:
          "La recuperation automatique n'est pas configuree. Ajoute FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET dans .env (voir README), ou ajoute des offres manuellement.",
      },
      { status: 400 }
    );
  }

  const [profile, criteria] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
  ]);

  const jobTitles = asStringArray(criteria?.jobTitles);
  const locations = asStringArray(criteria?.locations);
  const contractTypes = asStringArray(criteria?.contractTypes);

  if (jobTitles.length === 0) {
    return NextResponse.json(
      { error: "Definis au moins un intitule de poste dans tes criteres de recherche avant de recuperer des offres." },
      { status: 400 }
    );
  }

  let externalOffers;
  try {
    externalOffers = await fetchFranceTravailOffers({ jobTitles, locations, contractTypes });
  } catch (err) {
    console.error("Erreur recuperation France Travail:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de la recuperation des offres." },
      { status: 502 }
    );
  }

  const cvSkills = asStringArray(profile?.cvSkills);
  const cvEducationText = asObject(profile?.cvSections, EMPTY_SECTIONS).education.join(" ");
  const matchCriteria = buildMatchCriteria(criteria);

  let created = 0;
  let skipped = 0;

  for (const ext of externalOffers) {
    // Deduplication par identifiant externe ou URL.
    const existing = await prisma.offer.findFirst({
      where: { OR: [{ externalId: ext.externalId }, ...(ext.url ? [{ url: ext.url }] : [])] },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const match = await computeWeightedMatch(
      cvSkills,
      profile?.cvRawText ?? "",
      cvEducationText,
      { contractType: ext.contractType, location: ext.location, description: ext.description },
      matchCriteria
    );

    await prisma.offer.create({
      data: {
        title: ext.title,
        company: ext.company,
        location: ext.location,
        url: ext.url,
        description: ext.description,
        contractType: ext.contractType,
        source: "france_travail",
        externalId: ext.externalId,
        postedAt: ext.postedAt ? new Date(ext.postedAt) : null,
        ...matchResultToOfferData(match),
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: externalOffers.length });
}
