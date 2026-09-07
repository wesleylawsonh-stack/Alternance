// Detection du canal de candidature d'une offre, pour la preparation
// automatique de candidatures (voir autoApply.ts). Deux canaux geres :
// - EMAIL : un lien "mailto:" fourni explicitement par la source (fiable a
//   100%), ou une adresse email trouvee dans la description a proximite de
//   mots-cles de candidature (moins fiable, mais la candidature reste en
//   file d'attente pour validation humaine avant tout envoi - voir
//   ApplicationDraft.status - donc un faux positif occasionnel n'a pas de
//   consequence grave).
// - WEB : a defaut, l'URL de l'offre elle-meme (ouverture manuelle par le
//   candidat, pas d'envoi automatise possible sur un site tiers).

export type ApplyChannel = { type: "EMAIL"; target: string } | { type: "WEB"; target: string };

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const APPLY_KEYWORDS = [
  "cv",
  "candidature",
  "postul",
  "motivation",
  "contact",
  "recrut",
  "envoy",
  "adress",
  "mail",
];

function normalizeForKeywordSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Cherche une adresse email dans la description, mais seulement si un mot
 * evoquant une candidature apparait a proximite (fenetre de 150 caracteres
 * de part et d'autre) : une adresse email presente dans une description
 * pour une tout autre raison (ex: adresse generale de l'entreprise en
 * signature, sans rapport avec la candidature) est ainsi ecartee.
 */
function findEmailInDescription(description: string): string | null {
  const matches = [...description.matchAll(EMAIL_REGEX)];
  for (const match of matches) {
    const index = match.index ?? 0;
    const windowStart = Math.max(0, index - 150);
    const windowEnd = Math.min(description.length, index + match[0].length + 150);
    const windowNormalized = normalizeForKeywordSearch(description.slice(windowStart, windowEnd));
    if (APPLY_KEYWORDS.some((keyword) => windowNormalized.includes(keyword))) {
      return match[0];
    }
  }
  return null;
}

export function detectApplyChannel(offer: { url: string | null; description: string }): ApplyChannel | null {
  if (offer.url?.toLowerCase().startsWith("mailto:")) {
    const email = offer.url.slice("mailto:".length).split("?")[0].trim();
    if (email) return { type: "EMAIL", target: email };
  }

  const emailFromDescription = findEmailInDescription(offer.description);
  if (emailFromDescription) return { type: "EMAIL", target: emailFromDescription };

  if (offer.url && /^https?:\/\//i.test(offer.url)) {
    return { type: "WEB", target: offer.url };
  }

  return null;
}
