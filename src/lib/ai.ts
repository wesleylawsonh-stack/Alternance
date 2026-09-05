import Anthropic from "@anthropic-ai/sdk";
import type { ParsedCv } from "./cvParser";

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export type AdaptCvInput = {
  profile: {
    fullName: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  };
  cv: ParsedCv;
  offer: {
    title: string;
    company: string | null;
    description: string;
  };
  matchedSkills: string[];
  missingSkills: string[];
};

const SYSTEM_PROMPT = `Tu es un assistant qui adapte un CV existant a une offre d'emploi precise.
REGLE ABSOLUE : tu ne dois JAMAIS inventer, ajouter ou supposer une competence,
une experience, un diplome ou une donnee qui n'est pas deja presente dans le
CV original fourni. Tu peux seulement :
- reformuler des phrases existantes pour les rendre plus percutantes,
- reordonner les competences et experiences pour mettre en avant celles qui
  correspondent le mieux a l'offre,
- resumer ou raccourcir des elements existants,
- adapter le ton du profil/accroche en restant fidele aux faits fournis.
Si une competence demandee par l'offre est absente du CV, ne l'ajoute pas :
elle doit simplement ne pas apparaitre. Reponds uniquement avec le CV adapte
final, en texte brut structure (sections : ACCROCHE, COMPETENCES, EXPERIENCE,
FORMATION, LANGUES), sans commentaire ni explication autour.`;

export async function adaptCvWithAi(input: AdaptCvInput): Promise<string> {
  const anthropic = getClient();

  const userPrompt = `CV ORIGINAL (texte brut, source de verite absolue) :
"""
${input.cv.rawText}
"""

Competences deja detectees dans ce CV : ${input.cv.skills.join(", ") || "aucune"}

OFFRE VISEE :
Poste : ${input.offer.title}
Entreprise : ${input.offer.company ?? "non precisee"}
Description :
"""
${input.offer.description}
"""

Competences du CV qui correspondent a l'offre : ${input.matchedSkills.join(", ") || "aucune"}
Competences demandees par l'offre mais ABSENTES du CV (a ne surtout pas ajouter) : ${
    input.missingSkills.join(", ") || "aucune"
  }

Produis le CV adapte a cette offre en respectant strictement la regle de non-invention.`;

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Reponse IA vide");
  }
  return textBlock.text.trim();
}

/**
 * Adaptation sans IA : reordonne les competences et selectionne les
 * experiences/elements du CV original qui partagent des mots-cles avec
 * l'offre. Ne reformule rien, ne fabrique rien : n'utilise que du texte
 * deja present dans le CV.
 */
export function adaptCvWithTemplate(input: AdaptCvInput): string {
  const { profile, cv, offer, matchedSkills } = input;

  const offerWords = new Set(
    offer.description
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 3)
  );

  const scoreLine = (line: string): number => {
    const words = line
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 3);
    return words.reduce((acc, w) => acc + (offerWords.has(w) ? 1 : 0), 0);
  };

  const orderedSkills = [...cv.skills].sort((a, b) => {
    const aMatched = matchedSkills.includes(a) ? 1 : 0;
    const bMatched = matchedSkills.includes(b) ? 1 : 0;
    return bMatched - aMatched;
  });

  const orderedExperiences = [...cv.sections.experiences].sort((a, b) => scoreLine(b) - scoreLine(a));
  const orderedEducation = [...cv.sections.education];

  const lines: string[] = [];
  lines.push(`ACCROCHE`);
  lines.push(
    cv.sections.summary
      ? cv.sections.summary
      : `${profile.headline ?? profile.fullName ?? "Candidat"} - candidature pour le poste de ${offer.title}${
          offer.company ? ` chez ${offer.company}` : ""
        }.`
  );
  lines.push("");
  lines.push("COMPETENCES");
  lines.push(orderedSkills.length ? orderedSkills.join(", ") : "(aucune competence detectee dans le CV original)");
  lines.push("");
  lines.push("EXPERIENCE");
  lines.push(orderedExperiences.length ? orderedExperiences.join("\n") : "(non detectee automatiquement, voir CV original)");
  lines.push("");
  lines.push("FORMATION");
  lines.push(orderedEducation.length ? orderedEducation.join("\n") : "(non detectee automatiquement, voir CV original)");
  lines.push("");
  lines.push("LANGUES");
  lines.push(cv.sections.languages.length ? cv.sections.languages.join(", ") : "(non detectees automatiquement)");

  return lines.join("\n");
}

export async function adaptCv(input: AdaptCvInput): Promise<{ text: string; usedAi: boolean }> {
  if (isAiEnabled()) {
    try {
      const text = await adaptCvWithAi(input);
      return { text, usedAi: true };
    } catch (err) {
      console.error("Adaptation IA impossible, repli sur le mode template:", err);
    }
  }
  return { text: adaptCvWithTemplate(input), usedAi: false };
}

const HEADLINE_SYSTEM_PROMPT = `Tu rediges une accroche professionnelle courte (une seule phrase, moins de
120 caracteres) pour un CV, a partir du texte du CV fourni.
REGLE ABSOLUE : n'invente, n'ajoute ni ne suppose aucune information
(competence, experience, diplome, duree) absente du CV. Tu peux uniquement
reformuler ou resumer ce qui est deja present dans le texte fourni.
Reponds uniquement avec l'accroche elle-meme, sans guillemets et sans
commentaire autour.`;

export async function suggestHeadlineWithAi(cv: ParsedCv): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 100,
    system: HEADLINE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CV :
"""
${cv.rawText}
"""

Competences deja detectees dans ce CV : ${cv.skills.join(", ") || "aucune"}`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Reponse IA vide");
  }
  return textBlock.text.trim().replace(/^["'«]+|["'»]+$/g, "");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Suggestion d'accroche sans IA : reprend telle quelle la premiere phrase
 * du profil/resume du CV si elle existe, sinon compose une phrase courte a
 * partir de la formation et des competences deja detectees. Ne fabrique
 * rien : n'assemble que du texte deja present dans le CV.
 */
export function suggestHeadlineWithTemplate(cv: ParsedCv): string | null {
  if (cv.sections.summary) {
    const firstSentence = cv.sections.summary.split(/(?<=[.!?])\s+/)[0]?.trim();
    if (firstSentence) return truncate(firstSentence, 120);
  }

  const education = cv.sections.education[0];
  const topSkills = cv.skills.slice(0, 3);

  if (education && topSkills.length) {
    return truncate(`${education} — ${topSkills.join(", ")}`, 120);
  }
  if (education) return truncate(education, 120);
  if (topSkills.length) return truncate(`Profil ${topSkills.join(", ")}`, 120);

  return null;
}

export async function suggestHeadline(cv: ParsedCv): Promise<{ text: string | null; usedAi: boolean }> {
  if (isAiEnabled()) {
    try {
      const text = await suggestHeadlineWithAi(cv);
      if (text) return { text, usedAi: true };
    } catch (err) {
      console.error("Suggestion d'accroche IA impossible, repli sur le mode template:", err);
    }
  }
  return { text: suggestHeadlineWithTemplate(cv), usedAi: false };
}

export type EmailClassification = "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED" | null;

const CLASSIFY_SYSTEM_PROMPT = `Tu analyses un email recu dans le cadre d'une recherche d'emploi/alternance,
en lien avec une candidature deja envoyee a une entreprise precise. Determine
si cet email indique un changement de statut de cette candidature.
Reponds UNIQUEMENT avec un seul mot parmi :
- REJECTED (refus / candidature non retenue)
- INTERVIEW (proposition ou confirmation d'un entretien)
- OFFER (proposition d'embauche / offre de contrat / felicitations pour le poste)
- APPLIED (simple accuse de reception, rien de plus)
- NONE (email sans rapport avec un changement de statut de candidature, ou ambigu)
Ne reponds jamais autre chose qu'un seul de ces cinq mots.`;

export async function classifyApplicationEmailWithAi(params: {
  companyName: string | null;
  offerTitle: string;
  subject: string;
  from: string;
  bodyExcerpt: string;
}): Promise<EmailClassification> {
  if (!isAiEnabled()) return null;

  try {
    const anthropic = getClient();
    const message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 10,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Candidature concernee : poste "${params.offerTitle}" chez ${
            params.companyName ?? "entreprise inconnue"
          }.

Email recu :
De : ${params.from}
Objet : ${params.subject}
Extrait : """
${params.bodyExcerpt}
"""`,
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const label = textBlock.text.trim().toUpperCase();

    if (label === "REJECTED" || label === "INTERVIEW" || label === "OFFER" || label === "APPLIED") {
      return label;
    }
    return null;
  } catch (err) {
    console.error("Classification IA de l'email impossible:", err);
    return null;
  }
}
