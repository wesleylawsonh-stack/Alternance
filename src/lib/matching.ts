import { extractSkills } from "./skills";

export type MatchResult = {
  score: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  requiredSkills: string[];
};

/**
 * Calcule un score de compatibilite entre les competences d'un CV et celles
 * requises par une offre. Algorithme deterministe (pas d'IA requise) :
 * proportion des competences de l'offre deja presentes dans le CV, avec un
 * petit bonus si les mots-cles de recherche de l'utilisateur apparaissent
 * aussi dans l'offre.
 */
export function computeMatch(
  cvSkills: string[],
  offerDescription: string,
  extraKeywords: string[] = []
): MatchResult {
  const requiredSkills = extractSkills(offerDescription);
  const cvSet = new Set(cvSkills.map((s) => s.toLowerCase()));

  const matchedSkills = requiredSkills.filter((s) => cvSet.has(s.toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !cvSet.has(s.toLowerCase()));

  let score: number;
  if (requiredSkills.length === 0) {
    // Pas de competence identifiee dans l'offre : on retombe sur un score
    // neutre bas, pour eviter d'afficher 100% sans base de comparaison.
    score = 40;
  } else {
    score = Math.round((matchedSkills.length / requiredSkills.length) * 100);
  }

  if (extraKeywords.length > 0) {
    const descLower = offerDescription.toLowerCase();
    const keywordHits = extraKeywords.filter((k) => k.trim() && descLower.includes(k.trim().toLowerCase())).length;
    const bonus = Math.min(10, keywordHits * 3);
    score = Math.min(100, score + bonus);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    matchedSkills,
    missingSkills,
    requiredSkills,
  };
}
