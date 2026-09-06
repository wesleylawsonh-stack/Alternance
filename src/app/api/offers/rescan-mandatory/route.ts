import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkMandatoryCriteria } from "@/lib/ai";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "@/lib/matching";
import { asStringArray, asObject } from "@/lib/json";

// Un appel IA par offre peut prendre 1-2s : plafonne la duree de la
// fonction pour rester large sous les limites Vercel, meme sur un lot
// complet (voir BATCH_SIZE).
export const maxDuration = 60;

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

// Traite les offres par lots plutot que toutes d'un coup : evite de
// bloquer une seule requete HTTP sur potentiellement des centaines
// d'appels IA sequentiels (risque de timeout). Le client rappelle cette
// route en boucle jusqu'a ce que "remaining" tombe a 0 (voir la page
// Criteres).
const BATCH_SIZE = 15;

/**
 * Reevalue le critere obligatoire (Criteria.mandatoryCriteria) sur les
 * offres qui n'ont jamais ete verifiees (mandatoryCriteriaMet === null) -
 * typiquement des offres deja en base avant que le critere soit defini, ou
 * retrouvees "deja connues" (donc jamais recreees) lors des recuperations
 * suivantes. Sans ce rattrapage explicite, ces offres resteraient
 * indefiniment non evaluees.
 */
export async function POST() {
  const criteria = await prisma.criteria.findUnique({ where: { id: "singleton" } });
  if (!criteria?.mandatoryCriteria) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  const [profile, offers, totalRemaining] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.offer.findMany({ where: { mandatoryCriteriaMet: null }, take: BATCH_SIZE, orderBy: { fetchedAt: "desc" } }),
    prisma.offer.count({ where: { mandatoryCriteriaMet: null } }),
  ]);

  const cvSkills = asStringArray(profile?.cvSkills);
  const cvEducationText = asObject(profile?.cvSections, EMPTY_SECTIONS).education.join(" ");
  const matchCriteria = buildMatchCriteria(criteria);

  for (const offer of offers) {
    const mandatoryCriteriaMet = await checkMandatoryCriteria(criteria.mandatoryCriteria, {
      title: offer.title,
      company: offer.company,
      description: offer.description,
    });
    const match = await computeWeightedMatch(
      cvSkills,
      profile?.cvRawText ?? "",
      cvEducationText,
      {
        contractType: offer.contractType,
        location: offer.location,
        description: offer.description,
        mandatoryCriteriaMet,
      },
      matchCriteria
    );
    await prisma.offer.update({
      where: { id: offer.id },
      data: { mandatoryCriteriaMet, ...matchResultToOfferData(match) },
    });
  }

  return NextResponse.json({ processed: offers.length, remaining: Math.max(0, totalRemaining - offers.length) });
}
