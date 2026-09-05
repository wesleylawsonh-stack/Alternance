import { prisma } from "./db";
import { computeMatch } from "./matching";
import { asStringArray, toJsonString } from "./json";

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
  const keywords = asStringArray(criteria?.keywords);

  await Promise.all(
    offers.map((offer) => {
      const match = computeMatch(cvSkills, offer.description, keywords, cvRawText);
      return prisma.offer.update({
        where: { id: offer.id },
        data: {
          requiredSkills: toJsonString(match.requiredSkills),
          matchedSkills: toJsonString(match.matchedSkills),
          missingSkills: toJsonString(match.missingSkills),
          matchScore: match.score,
        },
      });
    })
  );

  return offers.length;
}
