import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { prepareApplicationDraft } from "@/lib/autoApply";

// Deux appels IA par offre (edition CV + message) : traite par lots plutot
// que d'un coup, meme principe que /api/offers/rescan-mandatory - le
// client rappelle cette route en boucle jusqu'a remaining === 0.
export const maxDuration = 60;
const BATCH_SIZE = 8;

export async function POST() {
  const criteria = await prisma.criteria.findUnique({ where: { id: "singleton" } });
  if (!criteria?.autoApplyEnabled) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  const where = {
    autoApplyChecked: false,
    recommendation: "POSTULER",
    NOT: { mandatoryCriteriaMet: false },
  };

  const [offers, totalRemaining] = await Promise.all([
    prisma.offer.findMany({ where, take: BATCH_SIZE, orderBy: { fetchedAt: "desc" }, select: { id: true } }),
    prisma.offer.count({ where }),
  ]);

  for (const offer of offers) {
    try {
      await prepareApplicationDraft(offer.id);
    } catch (err) {
      console.error(`Preparation automatique de candidature impossible pour l'offre ${offer.id}:`, err);
    }
  }

  return NextResponse.json({ processed: offers.length, remaining: Math.max(0, totalRemaining - offers.length) });
}
