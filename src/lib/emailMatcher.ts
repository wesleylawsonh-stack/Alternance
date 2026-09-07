import type { Offer } from "@prisma/client";
import type { GmailMessage } from "./gmail";
import { classifyApplicationEmailWithAi, isAiEnabled, type EmailClassification } from "./ai";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "developpeur", "developpeuse", "alternance", "stage", "poste", "emploi", "offre", "recherche",
  "junior", "senior", "web", "informatique", "assistant", "assistante", "chef", "responsable",
]);

/**
 * Cherche, parmi les offres deja "en cours" (candidature envoyee ou entretien),
 * celle qui correspond le mieux a un email recu (par nom d'entreprise dans
 * l'expediteur/objet/corps, puis a defaut par mots-cles significatifs du
 * titre du poste).
 */
export function matchOfferForEmail(offers: Offer[], message: GmailMessage): Offer | null {
  const haystack = normalize(`${message.from} ${message.subject} ${message.bodyText}`);

  let best: { offer: Offer; score: number } | null = null;

  for (const offer of offers) {
    let score = 0;

    if (offer.company) {
      const company = normalize(offer.company);
      if (company.length >= 3 && haystack.includes(company)) {
        score += 5;
      }
    }

    const titleWords = normalize(offer.title)
      .split(" ")
      .filter((w) => w.length > 3 && !STOPWORDS.has(w));
    const titleHits = titleWords.filter((w) => haystack.includes(w)).length;
    if (titleWords.length > 0) {
      score += (titleHits / titleWords.length) * 2;
    }

    if (score > (best?.score ?? 0)) {
      best = { offer, score };
    }
  }

  // Seuil minimal : soit un nom d'entreprise trouve (score >= 5), soit une
  // tres forte correspondance sur le titre du poste.
  if (best && best.score >= 3) {
    return best.offer;
  }
  return null;
}

// Patterns appliques a un texte normalise (minuscules, sans accents).
const REJECTED_PATTERNS = [
  /regret de vous informer/,
  /sommes au regret/,
  /n avons pas retenu/,
  /candidature n a pas ete retenue/,
  /ne (pourrons|pouvons) (pas )?donner suite/,
  /ne donnerons pas suite/,
  /ne sera pas donne suite/,
  /autre profil.*retenu/,
  /avons privilegie un autre/,
];

const INTERVIEW_PATTERNS = [
  /invit\w+ .*entretien/,
  /convier\w* .* entretien/,
  /planifier un entretien/,
  /disponibilites? .*entretien/,
  /entretien (telephonique|visio|physique|d embauche)/,
  /passer un entretien/,
  /echanger avec vous/,
];

const OFFER_PATTERNS = [
  /avons le plaisir de vous (proposer|offrir)/,
  /felicitations/,
  /vous proposer le poste/,
  /promesse d embauche/,
  /heureux de vous (accueillir|compter)/,
];

function classifyWithHeuristics(message: GmailMessage): EmailClassification {
  const text = normalize(`${message.subject} ${message.bodyText}`);
  if (REJECTED_PATTERNS.some((re) => re.test(text))) return "REJECTED";
  if (OFFER_PATTERNS.some((re) => re.test(text))) return "OFFER";
  if (INTERVIEW_PATTERNS.some((re) => re.test(text))) return "INTERVIEW";
  return null;
}

/**
 * Determine si un email correspond a un changement de statut de candidature.
 * Utilise l'IA si disponible (plus robuste aux formulations variees), avec
 * repli automatique sur des regles par mots-cles sinon.
 */
export async function classifyEmailForOffer(offer: Offer, message: GmailMessage): Promise<EmailClassification> {
  if (isAiEnabled()) {
    const aiResult = await classifyApplicationEmailWithAi({
      companyName: offer.company,
      offerTitle: offer.title,
      subject: message.subject,
      from: message.from,
      bodyExcerpt: message.bodyText.slice(0, 1500) || message.snippet,
    });
    if (aiResult) return aiResult;
  }
  return classifyWithHeuristics(message);
}
