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

export type CvEditSection = "HEADLINE" | "SUMMARY" | "EXPERIENCE" | "SKILLS";

export type CvEditProposal = {
  id: string; // "headline" | "summary" | "skills" | "experience-<index>"
  section: CvEditSection;
  label: string;
  original: string;
  proposed: string;
  rationale: string | null;
};

export type ProposeCvEditsInput = {
  cv: ParsedCv;
  currentHeadline: string | null;
  offer?: { title: string; company: string | null; description: string } | null;
};

const EDIT_SYSTEM_PROMPT = `Tu es un editeur de CV assiste par IA. Tu proposes des ameliorations de
formulation pour un CV existant, jamais de nouvelles informations.
REGLE ABSOLUE : tu ne dois JAMAIS inventer, ajouter ou supposer une
competence, une experience, un diplome, un chiffre ou un resultat qui
n'est pas deja present dans le texte fourni. Tu peux uniquement reformuler,
clarifier, rendre plus percutant avec des verbes d'action, ou reordonner
des elements deja presents. Si une offre est fournie, mets en avant ce qui
correspond deja au poste vise (sans inventer une correspondance qui
n'existe pas).

Reponds UNIQUEMENT avec un tableau JSON (pas de texte autour, pas de
markdown), ou chaque element a la forme :
{"id": "...", "proposed": "...", "rationale": "..."}
Les "id" valides sont : "headline", "summary", "skills", et "experience-0",
"experience-1", etc. selon les experiences fournies. N'inclus un id QUE si
tu proposes reellement un changement (omets les elements que tu ne
modifies pas). Pour "skills", "proposed" est la liste des competences
FOURNIES reordonnees, separees par des virgules (n'en ajoute et n'en
retire aucune). "rationale" est une phrase courte expliquant le
changement. Si tu n'as aucune amelioration a proposer, reponds avec un
tableau vide [].`;

function buildEditUserPrompt(input: ProposeCvEditsInput): string {
  const { cv, offer, currentHeadline } = input;
  const experiencesList = cv.sections.experiences
    .map((exp, i) => `experience-${i}: ${exp}`)
    .join("\n");

  let prompt = `CV ACTUEL (source de verite absolue, ne rien inventer au-dela) :
Accroche actuelle (headline) : ${currentHeadline ?? "(absente)"}
Resume/profil actuel (summary) : ${cv.sections.summary ?? "(absent)"}
Competences actuelles (skills) : ${cv.skills.join(", ") || "(aucune)"}
Experiences actuelles :
${experiencesList || "(aucune)"}

Texte brut complet du CV (contexte) :
"""
${cv.rawText}
"""`;

  if (offer) {
    prompt += `

OFFRE VISEE :
Poste : ${offer.title}
Entreprise : ${offer.company ?? "non precisee"}
Description :
"""
${offer.description}
"""
Mets en avant, parmi les elements deja presents dans le CV, ceux qui
correspondent le mieux a cette offre.`;
  } else {
    prompt += `

Aucune offre precise : propose des ameliorations generales (clarte,
impact, verbes d'action, suppression de formulations vagues) sans viser
un poste particulier.`;
  }

  return prompt;
}

function truncateGuard(original: string, proposed: string): boolean {
  // Garde-fou anti-fabrication : une proposition demesurement plus longue
  // que l'original a plus de chances d'ajouter une information inventee
  // que de simplement reformuler.
  if (!original) return proposed.length <= 400;
  return proposed.length <= original.length * 2.5 + 60;
}

function sanitizeSkillsProposal(originalSkills: string[], proposedRaw: string): string {
  const proposedList = proposedRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const originalSet = new Set(originalSkills.map((s) => s.toLowerCase()));
  // Ne garde que des competences deja presentes (jamais d'invention), puis
  // ajoute a la fin celles que l'IA aurait omises (aucune suppression
  // silencieuse : seul l'ordre change).
  const kept = proposedList.filter((s) => originalSet.has(s.toLowerCase()));
  const keptSet = new Set(kept.map((s) => s.toLowerCase()));
  const missing = originalSkills.filter((s) => !keptSet.has(s.toLowerCase()));
  return [...kept, ...missing].join(", ");
}

export async function proposeCvEditsWithAi(input: ProposeCvEditsInput): Promise<CvEditProposal[]> {
  const anthropic = getClient();
  const { cv, currentHeadline } = input;

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 2500,
    system: EDIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildEditUserPrompt(input) }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Reponse IA non structuree (JSON attendu)");
  const rawItems = JSON.parse(jsonMatch[0]) as Array<{ id?: string; proposed?: string; rationale?: string }>;

  const proposals: CvEditProposal[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    const id = typeof item.id === "string" ? item.id : "";
    const proposedRaw = typeof item.proposed === "string" ? item.proposed.trim() : "";
    if (!id || !proposedRaw || seen.has(id)) continue;

    if (id === "headline") {
      const original = currentHeadline ?? "";
      if (proposedRaw === original || !truncateGuard(original, proposedRaw)) continue;
      proposals.push({ id, section: "HEADLINE", label: "Accroche", original, proposed: proposedRaw, rationale: item.rationale ?? null });
    } else if (id === "summary") {
      const original = cv.sections.summary ?? "";
      if (proposedRaw === original || !truncateGuard(original, proposedRaw)) continue;
      proposals.push({ id, section: "SUMMARY", label: "Resume / profil", original, proposed: proposedRaw, rationale: item.rationale ?? null });
    } else if (id === "skills") {
      const original = cv.skills.join(", ");
      const proposed = sanitizeSkillsProposal(cv.skills, proposedRaw);
      if (proposed === original) continue;
      proposals.push({ id, section: "SKILLS", label: "Competences", original, proposed, rationale: item.rationale ?? null });
    } else if (id.startsWith("experience-")) {
      const index = Number(id.slice("experience-".length));
      const original = cv.sections.experiences[index];
      if (!Number.isInteger(index) || original === undefined) continue;
      if (proposedRaw === original || !truncateGuard(original, proposedRaw)) continue;
      proposals.push({
        id,
        section: "EXPERIENCE",
        label: `Experience ${index + 1}`,
        original,
        proposed: proposedRaw,
        rationale: item.rationale ?? null,
      });
    } else {
      continue;
    }
    seen.add(id);
  }

  return proposals;
}

/**
 * Propositions sans IA : reordonne uniquement les competences (celles
 * correspondant a l'offre en premier, si une offre est fournie). Aucune
 * reformulation n'est proposee sans IA : mieux vaut ne rien proposer que
 * fabriquer un texte.
 */
export function proposeCvEditsWithTemplate(input: ProposeCvEditsInput): CvEditProposal[] {
  const { cv, offer } = input;
  if (!offer || cv.skills.length === 0) return [];

  const offerWords = new Set(
    offer.description
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9+]+/)
      .filter((w) => w.length > 3)
  );

  const original = cv.skills.join(", ");
  const proposedOrder = [...cv.skills].sort((a, b) => {
    const aMatch = offerWords.has(a.toLowerCase()) ? 1 : 0;
    const bMatch = offerWords.has(b.toLowerCase()) ? 1 : 0;
    return bMatch - aMatch;
  });
  const proposed = proposedOrder.join(", ");
  if (proposed === original) return [];

  return [
    {
      id: "skills",
      section: "SKILLS",
      label: "Competences",
      original,
      proposed,
      rationale: "Competences en lien avec l'offre mises en avant en premier.",
    },
  ];
}

export async function proposeCvEdits(input: ProposeCvEditsInput): Promise<{ proposals: CvEditProposal[]; usedAi: boolean }> {
  if (isAiEnabled()) {
    try {
      const proposals = await proposeCvEditsWithAi(input);
      return { proposals, usedAi: true };
    } catch (err) {
      console.error("Proposition d'edition IA impossible, repli sur le mode template:", err);
    }
  }
  return { proposals: proposeCvEditsWithTemplate(input), usedAi: false };
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
