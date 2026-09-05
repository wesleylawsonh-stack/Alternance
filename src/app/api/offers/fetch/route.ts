import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "@/lib/matching";
import { asStringArray, asObject } from "@/lib/json";
import { fetchAllExternalOffers, isAnySourceConfigured } from "@/lib/offerSources";
import { computeOfferContentHash } from "@/lib/contentHash";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

// Meme logique de protection optionnelle que /api/gmail/sync : si
// CRON_SECRET est defini (site deploye publiquement), seul le cron Vercel
// (qui envoie automatiquement ce Bearer token) ou un appel explicite avec
// le secret peut declencher la recuperation. Sans CRON_SECRET, l'endpoint
// reste ouvert pour que le bouton "Recuperer des offres" fonctionne sans
// configuration supplementaire.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 });
  }

  const criteriaRow = await prisma.criteria.findUnique({ where: { id: "singleton" } });

  // Une requete declenchee par le cron Vercel porte cet en-tete. On la
  // laisse passer silencieusement (200, sans erreur) si la recuperation
  // automatique a ete desactivee dans les criteres, pour ne pas polluer les
  // logs Vercel avec de "fausses" erreurs a chaque execution quotidienne.
  const isCronTrigger = req.headers.get("x-vercel-cron") !== null;
  if (isCronTrigger && criteriaRow && !criteriaRow.autoFetchEnabled) {
    return NextResponse.json({ skipped: true, reason: "Recuperation automatique desactivee dans les criteres." });
  }

  if (!isAnySourceConfigured()) {
    return NextResponse.json(
      {
        error:
          "Aucune source de recuperation automatique n'est configuree. Ajoute FRANCE_TRAVAIL_CLIENT_ID/SECRET, ADZUNA_APP_ID/KEY et/ou LBA_API_KEY dans .env (voir README), ou ajoute des offres manuellement.",
      },
      { status: 400 }
    );
  }

  const profile = await prisma.profile.findUnique({ where: { id: "singleton" } });
  const criteria = criteriaRow;

  const jobTitles = asStringArray(criteria?.jobTitles);
  const locations = asStringArray(criteria?.locations);
  const contractTypes = asStringArray(criteria?.contractTypes);

  if (jobTitles.length === 0) {
    return NextResponse.json(
      { error: "Definis au moins un intitule de poste dans tes criteres de recherche avant de recuperer des offres." },
      { status: 400 }
    );
  }

  // Architecture : sources -> normalisation -> deduplication -> criteres ->
  // matching CV -> score -> classement -> affichage. La deduplication ici
  // couvre le cas ou une meme offre est publiee sur plusieurs sources (ou
  // republiee avec un nouvel identifiant externe) : on compare l'identifiant
  // externe, l'URL, ET une empreinte de contenu (titre+entreprise+description
  // normalises), en plus du titre+entreprise exact.
  const { offers: externalOffers, sourceErrors } = await fetchAllExternalOffers({
    jobTitles,
    locations,
    contractTypes,
    radiusKm: criteria?.radiusKm ?? null,
  });

  const cvSkills = asStringArray(profile?.cvSkills);
  const cvEducationText = asObject(profile?.cvSections, EMPTY_SECTIONS).education.join(" ");
  const matchCriteria = buildMatchCriteria(criteria);

  let created = 0;
  let skipped = 0;

  for (const ext of externalOffers) {
    const contentHash = computeOfferContentHash(ext.title, ext.company, ext.description);

    const orConditions: Array<Record<string, unknown>> = [{ externalId: ext.externalId }, { contentHash }];
    if (ext.url) orConditions.push({ url: ext.url });
    if (ext.company && ext.title) {
      orConditions.push({ company: { equals: ext.company, mode: "insensitive" }, title: { equals: ext.title, mode: "insensitive" } });
    }

    const existing = await prisma.offer.findFirst({ where: { OR: orConditions } });
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
        companyLogoUrl: ext.companyLogoUrl,
        location: ext.location,
        url: ext.url,
        description: ext.description,
        contractType: ext.contractType,
        source: ext.source,
        externalId: ext.externalId,
        contentHash,
        postedAt: ext.postedAt ? new Date(ext.postedAt) : null,
        ...matchResultToOfferData(match),
      },
    });
    created++;
  }

  return NextResponse.json({
    created,
    skipped,
    total: externalOffers.length,
    sourceErrors: sourceErrors.length > 0 ? sourceErrors : undefined,
  });
}
