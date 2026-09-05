import { extractSkills } from "./skills";

export type MatchResult = {
  score: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  requiredSkills: string[];
  contentScore: number; // 0-100, chevauchement de vocabulaire CV <-> offre (hors dictionnaire de competences)
};

// Mots fonctionnels frequents en francais a ignorer lors du calcul du
// chevauchement de contenu (sinon deux textes quelconques se ressembleraient
// artificiellement juste parce qu'ils partagent des mots grammaticaux).
const STOPWORDS_FR = new Set([
  "dans", "pour", "avec", "être", "etre", "avoir", "tout", "tous", "toute", "toutes",
  "notre", "votre", "leurs", "cette", "alors", "ainsi", "comme", "quand", "chez",
  "vers", "sous", "leur", "nous", "vous", "elle", "elles", "ils", "sont", "sera",
  "seront", "plus", "moins", "tres", "bien", "peut", "peuvent", "doit", "doivent",
  "cela", "ceux", "celle", "celles", "meme", "memes", "entre", "apres", "avant",
  "pendant", "depuis", "sans", "deja", "encore", "toujours", "jamais", "autre",
  "autres", "certain", "certains", "certaine", "certaines", "plusieurs", "donc",
  "lorsque", "egalement", "notamment", "cet", "ceci", "ici", "voici", "voila",
  "afin", "ayant", "etant", "quel", "quelle", "quels", "quelles", "vos", "nos",
  "aux", "des", "les", "une", "et", "ou", "où", "que", "qui", "quoi", "dont", "car",
]);

function significantWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length > 3 && !STOPWORDS_FR.has(w));
  return new Set(words);
}

/**
 * Chevauchement de vocabulaire entre le texte complet du CV et celui de
 * l'offre : quelle proportion des mots significatifs de l'offre se
 * retrouve, telle quelle, dans le CV. Complementaire au score par
 * competences du dictionnaire : capture la pertinence generale du CV
 * (experiences, contexte, formulation) au-dela des seules competences
 * reconnues.
 */
export function computeContentOverlap(cvText: string, offerDescription: string): number {
  const offerWords = significantWords(offerDescription);
  if (offerWords.size === 0) return 0;

  const cvWords = significantWords(cvText);
  let hits = 0;
  for (const w of offerWords) {
    if (cvWords.has(w)) hits++;
  }
  return Math.round((hits / offerWords.size) * 100);
}

/**
 * Calcule un score de compatibilite entre le CV et une offre. Combine deux
 * signaux deterministes (pas d'IA requise) :
 * - le pourcentage de competences requises par l'offre (dictionnaire) deja
 *   presentes dans le CV ;
 * - le chevauchement de vocabulaire entre le texte complet du CV et celui
 *   de l'offre, pour tenir compte du contenu reel du CV (experiences,
 *   contexte...) et pas seulement des competences reconnues par le
 *   dictionnaire.
 * Un petit bonus s'ajoute si les mots-cles de recherche de l'utilisateur
 * apparaissent aussi dans l'offre.
 */
export function computeMatch(
  cvSkills: string[],
  offerDescription: string,
  extraKeywords: string[] = [],
  cvRawText = ""
): MatchResult {
  const requiredSkills = extractSkills(offerDescription);
  const cvSet = new Set(cvSkills.map((s) => s.toLowerCase()));

  const matchedSkills = requiredSkills.filter((s) => cvSet.has(s.toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !cvSet.has(s.toLowerCase()));

  const contentScore = computeContentOverlap(cvRawText, offerDescription);

  let score: number;
  if (requiredSkills.length === 0) {
    // Aucune competence du dictionnaire identifiee dans l'offre : le
    // chevauchement de contenu devient le signal principal (a la place
    // d'un score neutre fixe qui ignorait completement le CV).
    score = contentScore;
  } else {
    const skillScore = (matchedSkills.length / requiredSkills.length) * 100;
    score = Math.round(skillScore * 0.7 + contentScore * 0.3);
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
    contentScore,
  };
}
