import { prisma } from "./db";
import { computeWeightedMatch, buildMatchCriteria, matchResultToOfferData } from "./matching";
import { asStringArray, asObject } from "./json";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

/**
 * Recalcule le score de matching de toutes les offres stockees, a partir du
 * CV et des criteres actuels. Appele apres import/mise a jour du CV ou des
 * criteres, pour garder les scores affiches a jour.
 */
export async function recomputeAllOfferScores(): Promise<number> {
  const [profile, criteria, offers] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
    prisma.offer.findMany(),
  ]);

  const cvSkills = asStringArray(profile?.cvSkills);
  const cvRawText = profile?.cvRawText ?? "";
  const cvEducationText = asObject(profile?.cvSections, EMPTY_SECTIONS).education.join(" ");
  const matchCriteria = buildMatchCriteria(criteria);

  await Promise.all(
    offers.map(async (offer) => {
      const match = await computeWeightedMatch(
        cvSkills,
        cvRawText,
        cvEducationText,
        { contractType: offer.contractType, location: offer.location, description: offer.description },
        matchCriteria
      );
      return prisma.offer.update({
        where: { id: offer.id },
        data: matchResultToOfferData(match),
      });
    })
  );

  return offers.length;
}
