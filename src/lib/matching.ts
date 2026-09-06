import { extractSkills } from "./skills";
import { distanceBetweenPlacesKm, geocodeDetailed, departmentCodeFromCitycode } from "./geocode";
import { departmentsForRegion } from "./frenchRegions";
import { asStringArray, toJsonString } from "./json";
import type { Criteria } from "@prisma/client";

export type Recommendation = "POSTULER" | "CONSIDERER" | "FAIBLE" | "IGNORER";

export type MatchResult = {
  score: number; // 0-100
  matchedSkills: string[];
  missingSkills: string[];
  requiredSkills: string[];
  contentScore: number; // 0-100, chevauchement de vocabulaire CV <-> offre (hors dictionnaire de competences)
  strengths: string[];
  weaknesses: string[];
  criteriaRespected: string[];
  criteriaNotRespected: string[];
  mainReason: string;
  recommendation: Recommendation;
};

export type MatchCriteria = {
  contractTypes: string[];
  locations: string[];
  radiusKm: number | null;
  remote: boolean;
  excludeKeywords: string[];
  keywords: string[];
  searchDescription: string | null;
};

export type MatchOfferInfo = {
  contractType: string | null;
  location: string | null;
  description: string;
  // Resultat de la verification du critere obligatoire libre (voir
  // ai.ts#checkMandatoryCriteria), deja calcule en amont (jamais d'appel IA
  // ici : computeWeightedMatch reste synchrone/testable). null = aucun
  // critere obligatoire n'etait defini au moment de la recuperation de
  // cette offre : ne penalise jamais dans ce cas (ne bloque pas sur une
  // information non evaluee).
  mandatoryCriteriaMet?: boolean | null;
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

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function significantWords(text: string): Set<string> {
  const words = normalizeText(text)
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

const EDUCATION_LEVEL_PATTERNS: Array<{ level: number; patterns: RegExp[] }> = [
  { level: 2, patterns: [/bac\s*\+?\s*2/, /\bdut\b/, /\bbts\b/] },
  { level: 3, patterns: [/bac\s*\+?\s*3/, /\blicence\b/, /\bbut\b/] },
  { level: 5, patterns: [/bac\s*\+?\s*5/, /\bmaster\b/, /\bmastere\b/, /\bingenieur\b/] },
  { level: 8, patterns: [/doctorat/, /\bphd\b/] },
];

/** Plus haut niveau de formation detecte dans un texte (0 si aucun). */
function detectEducationLevel(text: string): number {
  const normalized = normalizeText(text);
  let max = 0;
  for (const { level, patterns } of EDUCATION_LEVEL_PATTERNS) {
    if (patterns.some((p) => p.test(normalized))) max = Math.max(max, level);
  }
  return max;
}

/** Niveau d'experience demande par l'offre, si explicitement mentionne. */
function detectSeniorityRequirement(text: string): "senior" | "confirme" | null {
  const normalized = normalizeText(text);
  if (/\bsenior\b/.test(normalized) || /\b(5|6|7|8|9|10)\s*\+?\s*ans?\b/.test(normalized)) return "senior";
  if (/confirme/.test(normalized) || /\b(3|4)\s*\+?\s*ans?\b/.test(normalized)) return "confirme";
  return null;
}

// Les intitules de contrat "grand public" (Alternance) ne correspondent pas
// toujours aux libelles bruts renvoyes par les sources d'offres (France
// Travail/Adzuna parlent de "Contrat d'apprentissage" ou "Contrat de
// professionnalisation", jamais litteralement "Alternance"). Sans ce
// regroupement par synonymes, une simple comparaison de sous-chaine
// penalise a tort quasiment toutes les vraies offres d'alternance.
const CONTRACT_TYPE_SYNONYMS: Record<string, string[]> = {
  alternance: ["alternance", "apprentissage", "apprenti", "professionnalisation"],
  stage: ["stage", "stagiaire"],
  cdi: ["cdi"],
  cdd: ["cdd"],
  interim: ["interim", "interimaire", "mission"],
};

function contractTypeGroup(text: string): string | null {
  const normalized = normalizeText(text);
  for (const [group, synonyms] of Object.entries(CONTRACT_TYPE_SYNONYMS)) {
    if (synonyms.some((s) => normalized.includes(s))) return group;
  }
  return null;
}

function contractTypeOk(offerContractType: string | null, criteriaContractTypes: string[]): boolean {
  if (!offerContractType || criteriaContractTypes.length === 0) return true;
  const offerNormalized = normalizeText(offerContractType);
  const offerGroup = contractTypeGroup(offerContractType);

  return criteriaContractTypes.some((c) => {
    const criteriaGroup = contractTypeGroup(c);
    if (offerGroup && criteriaGroup) return offerGroup === criteriaGroup;
    // Repli sur la comparaison textuelle brute si l'un des deux libelles ne
    // correspond a aucun groupe connu (intitule personnalise/inattendu).
    const cn = normalizeText(c);
    return offerNormalized.includes(cn) || cn.includes(offerNormalized);
  });
}

function findExcludedKeyword(text: string, excludeKeywords: string[]): string | null {
  const lower = text.toLowerCase();
  for (const k of excludeKeywords) {
    if (k.trim() && lower.includes(k.trim().toLowerCase())) return k.trim();
  }
  return null;
}

/**
 * Verifie si l'offre est dans le rayon de recherche, ou dans l'une des
 * regions recherchees. Chaque entree de criteria.locations est soit un nom
 * de region connue (frenchRegions.ts) soit un nom de ville : les regions
 * sont verifiees par appartenance de departement (l'offre est dans la
 * region si son departement en fait partie, independamment d'un rayon),
 * les villes par distance a vol d'oiseau + rayon (comportement existant).
 * Ne penalise jamais si l'information est indisponible ou impossible a
 * determiner (geocodage hors ligne, ville inconnue...) : on ne bloque
 * jamais le matching pour un probleme reseau.
 */
async function checkLocation(
  offerLocation: string | null,
  criteria: MatchCriteria
): Promise<{ ok: boolean; distanceKm: number | null }> {
  if (criteria.remote) return { ok: true, distanceKm: null };
  if (criteria.locations.length === 0 || !offerLocation) {
    return { ok: true, distanceKm: null };
  }
  if (/remote|teletravail|télétravail|distanciel/i.test(offerLocation)) {
    return { ok: true, distanceKm: null };
  }

  const regionEntries = criteria.locations.filter((loc) => departmentsForRegion(loc));
  const cityEntries = criteria.locations.filter((loc) => !departmentsForRegion(loc));

  if (regionEntries.length > 0) {
    const offerDetails = await geocodeDetailed(offerLocation);
    const offerDept = departmentCodeFromCitycode(offerDetails?.citycode ?? null);
    const inRegion = offerDept ? regionEntries.some((region) => departmentsForRegion(region)!.includes(offerDept)) : false;
    if (inRegion) return { ok: true, distanceKm: null };
    if (cityEntries.length === 0) {
      // Seules des regions etaient demandees : hors de toutes, sauf si le
      // departement de l'offre n'a pas pu etre determine (on ne bloque pas).
      return { ok: !offerDept, distanceKm: null };
    }
  }

  if (!criteria.radiusKm) return { ok: true, distanceKm: null };

  const distances = await Promise.all(
    cityEntries.map((loc) => distanceBetweenPlacesKm(loc, offerLocation))
  );
  const validDistances = distances.filter((d): d is number => d !== null);
  if (validDistances.length === 0) return { ok: true, distanceKm: null };

  const minDistance = Math.min(...validDistances);
  return { ok: minDistance <= criteria.radiusKm, distanceKm: Math.round(minDistance) };
}

const EMPTY_CRITERIA: MatchCriteria = {
  contractTypes: [],
  locations: [],
  radiusKm: null,
  remote: false,
  excludeKeywords: [],
  keywords: [],
  searchDescription: null,
};

/**
 * Calcule un score de compatibilite pondere entre le CV et une offre, en
 * combinant plusieurs signaux :
 * - competences du dictionnaire presentes dans le CV ;
 * - chevauchement de vocabulaire CV <-> offre (contenu reel, pas seulement
 *   les competences reconnues) ;
 * - criteres "durs" qui penalisent fortement le score s'ils ne sont pas
 *   respectes : type de contrat, niveau d'experience demande, formation
 *   requise, localisation/rayon, mots-cles exclus.
 * Retourne aussi une explication (points forts/faibles, criteres
 * respectes/non respectes, raison principale, recommandation) pour
 * affichage.
 */
export async function computeWeightedMatch(
  cvSkills: string[],
  cvRawText: string,
  cvEducationText: string,
  offer: MatchOfferInfo,
  criteria: MatchCriteria = EMPTY_CRITERIA
): Promise<MatchResult> {
  const requiredSkills = extractSkills(offer.description);
  const cvSet = new Set(cvSkills.map((s) => s.toLowerCase()));
  const matchedSkills = requiredSkills.filter((s) => cvSet.has(s.toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !cvSet.has(s.toLowerCase()));

  const contentScore = computeContentOverlap(cvRawText, offer.description);
  const skillScore = requiredSkills.length ? (matchedSkills.length / requiredSkills.length) * 100 : null;
  const baseFit = skillScore === null ? contentScore : skillScore * 0.65 + contentScore * 0.35;

  const contractOk = contractTypeOk(offer.contractType, criteria.contractTypes);
  const requiredEducation = detectEducationLevel(offer.description);
  const candidateEducation = detectEducationLevel(cvEducationText);
  const educationOk = requiredEducation === 0 || candidateEducation >= requiredEducation;
  const seniority = detectSeniorityRequirement(offer.description);
  const experienceOk = seniority === null;
  const excludedHit = findExcludedKeyword(offer.description, criteria.excludeKeywords);
  const { ok: locationOk, distanceKm } = await checkLocation(offer.location, criteria);
  // undefined/null = critere obligatoire non evalue (pas defini au moment
  // de la recuperation) : ne penalise jamais dans ce cas.
  const mandatoryOk = offer.mandatoryCriteriaMet !== false;

  let multiplier = 1;
  if (!contractOk) multiplier *= 0.35;
  if (!educationOk) multiplier *= 0.6;
  if (!experienceOk) multiplier *= seniority === "senior" ? 0.3 : 0.55;
  if (!locationOk) multiplier *= 0.5;
  if (excludedHit) multiplier *= 0.1;
  if (!mandatoryOk) multiplier *= 0.15;

  let score = Math.round(baseFit * multiplier);

  if (criteria.keywords.length > 0) {
    const descLower = offer.description.toLowerCase();
    const hits = criteria.keywords.filter((k) => k.trim() && descLower.includes(k.trim().toLowerCase())).length;
    score = Math.min(100, score + Math.min(10, hits * 3));
  }

  // Description libre de ce que l'utilisateur recherche : chevauchement de
  // vocabulaire avec l'offre, meme logique que le contenu du CV, mais bonus
  // plafonne separement pour ne pas ecraser les autres signaux.
  const searchDescriptionOverlap = criteria.searchDescription
    ? computeContentOverlap(criteria.searchDescription, offer.description)
    : 0;
  if (searchDescriptionOverlap > 0) {
    score = Math.min(100, score + Math.round(searchDescriptionOverlap * 0.08));
  }
  score = Math.max(0, Math.min(100, score));

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const criteriaRespected: string[] = [];
  const criteriaNotRespected: string[] = [];

  if (requiredSkills.length > 0) {
    if (matchedSkills.length === requiredSkills.length) {
      strengths.push("Toutes les competences identifiees dans l'offre sont presentes dans ton CV.");
    } else if (matchedSkills.length > 0) {
      strengths.push(`${matchedSkills.length}/${requiredSkills.length} competence(s) deja presente(s) : ${matchedSkills.join(", ")}.`);
    }
    if (missingSkills.length > 0) {
      weaknesses.push(`Competence(s) manquante(s) : ${missingSkills.join(", ")}.`);
    }
  }
  if (contentScore >= 50) {
    strengths.push("Le contenu de ton CV correspond bien au vocabulaire de l'offre.");
  }

  if (contractOk) criteriaRespected.push("Type de contrat");
  else {
    criteriaNotRespected.push("Type de contrat");
    weaknesses.push(`Type de contrat de l'offre (${offer.contractType}) different de ce que tu recherches.`);
  }

  if (educationOk) criteriaRespected.push("Formation");
  else {
    criteriaNotRespected.push("Formation");
    weaknesses.push("Niveau de formation demande superieur a celui detecte dans ton CV.");
  }

  if (experienceOk) criteriaRespected.push("Niveau d'experience");
  else {
    criteriaNotRespected.push("Niveau d'experience");
    weaknesses.push(`Profil ${seniority} demande : peu compatible avec un profil junior/etudiant.`);
  }

  if (locationOk) criteriaRespected.push("Localisation");
  else {
    criteriaNotRespected.push("Localisation");
    weaknesses.push(
      distanceKm !== null
        ? `Offre a environ ${distanceKm} km, au-dela de ton rayon de recherche.`
        : "Localisation hors de ton rayon de recherche."
    );
  }

  if (excludedHit) {
    criteriaNotRespected.push("Mots-cles exclus");
    weaknesses.push(`Contient le mot-cle exclu "${excludedHit}".`);
  }

  if (offer.mandatoryCriteriaMet === true) {
    criteriaRespected.push("Critere obligatoire");
  } else if (offer.mandatoryCriteriaMet === false) {
    criteriaNotRespected.push("Critere obligatoire");
    weaknesses.push("Ne semble pas correspondre au critere obligatoire que tu as defini.");
  }

  let mainReason: string;
  if (excludedHit) mainReason = `Contient un mot-cle que tu exclus ("${excludedHit}").`;
  else if (!mandatoryOk) mainReason = "Ne semble pas correspondre au critere obligatoire que tu as defini.";
  else if (!contractOk) mainReason = "Type de contrat different de ta recherche.";
  else if (!experienceOk) mainReason = `Niveau d'experience demande (${seniority}) peu compatible avec un profil junior.`;
  else if (!locationOk) mainReason = "Localisation hors de ton rayon de recherche.";
  else if (!educationOk) mainReason = "Niveau de formation demande superieur a celui detecte dans ton CV.";
  else if (requiredSkills.length > 0 && matchedSkills.length === 0) mainReason = "Aucune competence en commun identifiee.";
  else if (score >= 70) mainReason = "Bonne correspondance globale avec ton profil et tes criteres.";
  else mainReason = "Correspondance partielle avec ton profil et tes criteres.";

  const recommendation: Recommendation = score >= 70 ? "POSTULER" : score >= 45 ? "CONSIDERER" : score >= 20 ? "FAIBLE" : "IGNORER";

  return {
    score,
    matchedSkills,
    missingSkills,
    requiredSkills,
    contentScore,
    strengths,
    weaknesses,
    criteriaRespected,
    criteriaNotRespected,
    mainReason,
    recommendation,
  };
}

export function buildMatchCriteria(criteria: Criteria | null | undefined): MatchCriteria {
  if (!criteria) return EMPTY_CRITERIA;
  return {
    contractTypes: asStringArray(criteria.contractTypes),
    locations: asStringArray(criteria.locations),
    radiusKm: criteria.radiusKm ?? null,
    remote: criteria.remote,
    excludeKeywords: asStringArray(criteria.excludeKeywords),
    keywords: asStringArray(criteria.keywords),
    searchDescription: criteria.searchDescription ?? null,
  };
}

/** Champs Prisma (JSON serialise) a ecrire sur une offre a partir d'un MatchResult. */
export function matchResultToOfferData(match: MatchResult) {
  return {
    requiredSkills: toJsonString(match.requiredSkills),
    matchedSkills: toJsonString(match.matchedSkills),
    missingSkills: toJsonString(match.missingSkills),
    strengths: toJsonString(match.strengths),
    weaknesses: toJsonString(match.weaknesses),
    criteriaRespected: toJsonString(match.criteriaRespected),
    criteriaNotRespected: toJsonString(match.criteriaNotRespected),
    mainReason: match.mainReason,
    recommendation: match.recommendation,
    matchScore: match.score,
  };
}
