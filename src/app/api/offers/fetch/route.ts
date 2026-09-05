import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeMatch } from "@/lib/matching";
import { asStringArray, toJsonString } from "@/lib/json";
import { fetchFranceTravailOffers, isFranceTravailConfigured } from "@/lib/franceTravail";

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
  const keywords = asStringArray(criteria?.keywords);
  const excludeKeywords = asStringArray(criteria?.excludeKeywords).map((k) => k.toLowerCase());

  let created = 0;
  let skipped = 0;

  for (const ext of externalOffers) {
    if (excludeKeywords.length) {
      const haystack = `${ext.title} ${ext.description}`.toLowerCase();
      if (excludeKeywords.some((k) => k && haystack.includes(k))) {
        skipped++;
        continue;
      }
    }

    const existing = await prisma.offer.findUnique({ where: { externalId: ext.externalId } });
    if (existing) {
      skipped++;
      continue;
    }

    const match = computeMatch(cvSkills, ext.description, keywords);

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
        requiredSkills: toJsonString(match.requiredSkills),
        matchedSkills: toJsonString(match.matchedSkills),
        missingSkills: toJsonString(match.missingSkills),
        matchScore: match.score,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped, total: externalOffers.length });
}
