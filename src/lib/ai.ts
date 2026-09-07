import Anthropic from "@anthropic-ai/sdk";
import type { ParsedCv } from "./cvParser";
import { parseCvText } from "./cvParser";
import { extractSkills } from "./skills";
import { computeContentOverlap, significantWords } from "./matching";

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

/**
 * Les erreurs d'appel IA sont interceptees et remplacees par un repli
 * heuristique (voir chaque fonction *WithAi ci-dessous) : l'utilisateur ne
 * doit jamais voir un plantage juste parce que l'IA est indisponible. Mais
 * un repli silencieux rend impossible de diagnostiquer un vrai probleme
 * (mauvaise cle, quota, panne reseau...) : cette fonction extrait un
 * message exploitable a partir des classes d'erreur typees du SDK pour le
 * remonter a l'utilisateur (cote route API / UI), sans jamais bloquer le
 * repli lui-meme.
 */
function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Cle API Anthropic invalide ou revoquee (401).";
  if (err instanceof Anthropic.PermissionDeniedError) return "Cle API Anthropic sans les permissions necessaires (403).";
  if (err instanceof Anthropic.RateLimitError) return "Limite de requetes Anthropic atteinte (429).";
  if (err instanceof Anthropic.APIConnectionError) return `Connexion a l'API Anthropic impossible : ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Erreur API Anthropic (${err.status ?? "?"}) : ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
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
  searchDescription?: string | null;
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
  const { cv, offer, currentHeadline, searchDescription } = input;
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

  if (searchDescription) {
    prompt += `

CE QUE LE CANDIDAT RECHERCHE (contexte donne par lui-meme, a prendre en
compte pour orienter le ton et les elements mis en avant - ne sert JAMAIS
de source pour ajouter une information au CV) :
"""
${searchDescription}
"""`;
  }

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
    thinking: { type: "disabled" },
    system: EDIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildEditUserPrompt(input) }],
  } as Anthropic.MessageCreateParamsNonStreaming);

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

export async function proposeCvEdits(
  input: ProposeCvEditsInput
): Promise<{ proposals: CvEditProposal[]; usedAi: boolean; aiError?: string }> {
  if (isAiEnabled()) {
    try {
      const proposals = await proposeCvEditsWithAi(input);
      return { proposals, usedAi: true };
    } catch (err) {
      const aiError = describeAiError(err);
      console.error("Proposition d'edition IA impossible, repli sur le mode template:", err);
      return { proposals: proposeCvEditsWithTemplate(input), usedAi: false, aiError };
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
    thinking: { type: "disabled" },
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
  } as Anthropic.MessageCreateParamsNonStreaming);

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

export async function suggestHeadline(
  cv: ParsedCv
): Promise<{ text: string | null; usedAi: boolean; aiError?: string }> {
  if (isAiEnabled()) {
    try {
      const text = await suggestHeadlineWithAi(cv);
      if (text) return { text, usedAi: true };
    } catch (err) {
      const aiError = describeAiError(err);
      console.error("Suggestion d'accroche IA impossible, repli sur le mode template:", err);
      return { text: suggestHeadlineWithTemplate(cv), usedAi: false, aiError };
    }
  }
  return { text: suggestHeadlineWithTemplate(cv), usedAi: false };
}

export type ApplicationMessageInput = {
  cv: ParsedCv;
  headline: string | null;
  fullName: string | null;
  offer: { title: string; company: string | null; description: string };
  matchedSkills: string[];
};

const APPLICATION_MESSAGE_SYSTEM_PROMPT = `Tu rediges un court message de candidature (a joindre a un CV, style
email professionnel) en francais, base UNIQUEMENT sur les informations
fournies (CV, competences deja detectees, offre).
REGLE ABSOLUE : n'invente, n'ajoute ni ne suppose aucune information
(competence, experience, diplome, resultat, motivation specifique) absente
du CV ou des competences fournies. Tu peux uniquement reformuler et mettre
en avant ce qui est deja present, en le reliant a l'offre.
Le message doit : commencer par une formule de politesse, mentionner le
poste et l'entreprise cibles, mettre en avant 2-3 elements du profil
(competences/experiences deja detectees) en lien avec l'offre, et se
terminer par une formule de politesse et une signature avec le prenom/nom
si fourni. Reste concis (150 mots maximum).
Reponds UNIQUEMENT avec le texte du message, sans commentaire ni markdown
autour.`;

export async function generateApplicationMessageWithAi(input: ApplicationMessageInput): Promise<string> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 400,
    thinking: { type: "disabled" },
    system: APPLICATION_MESSAGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Poste vise : ${input.offer.title}${input.offer.company ? ` chez ${input.offer.company}` : ""}
Description de l'offre :
"""
${input.offer.description}
"""

CV (texte brut) :
"""
${input.cv.rawText}
"""

Competences deja detectees dans le CV : ${input.cv.skills.join(", ") || "aucune"}
Competences qui correspondent specifiquement a cette offre : ${input.matchedSkills.join(", ") || "aucune"}
Accroche actuelle du CV : ${input.headline || "aucune"}
Nom complet du candidat (pour la signature) : ${input.fullName || "non renseigne"}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Reponse IA vide");
  }
  return textBlock.text.trim();
}

/**
 * Message de candidature sans IA : assemble un texte generique a partir
 * des competences correspondantes deja detectees et de l'accroche du CV.
 * N'invente rien : ne reference que des elements deja presents dans le CV.
 */
export function generateApplicationMessageWithTemplate(input: ApplicationMessageInput): string {
  const { offer, matchedSkills, headline, fullName } = input;
  const skillsPart =
    matchedSkills.length > 0
      ? `Mon profil comprend notamment : ${matchedSkills.slice(0, 5).join(", ")}.`
      : "";
  const headlinePart = headline ? `${headline}.` : "";

  return [
    "Bonjour,",
    "",
    `Je vous adresse ma candidature pour le poste de ${offer.title}${offer.company ? ` au sein de ${offer.company}` : ""}.`,
    [headlinePart, skillsPart].filter(Boolean).join(" "),
    "Vous trouverez ci-joint mon CV, adapte pour ce poste. Je serais ravi de vous en dire plus lors d'un entretien.",
    "",
    "Cordialement,",
    fullName || "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function generateApplicationMessage(
  input: ApplicationMessageInput
): Promise<{ text: string; usedAi: boolean; aiError?: string }> {
  if (isAiEnabled()) {
    try {
      const text = await generateApplicationMessageWithAi(input);
      if (text) return { text, usedAi: true };
    } catch (err) {
      const aiError = describeAiError(err);
      console.error("Generation du message de candidature IA impossible, repli sur le mode template:", err);
      return { text: generateApplicationMessageWithTemplate(input), usedAi: false, aiError };
    }
  }
  return { text: generateApplicationMessageWithTemplate(input), usedAi: false };
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
      thinking: { type: "disabled" },
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
    } as Anthropic.MessageCreateParamsNonStreaming);

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

export type CvScoreCategory = "impact" | "lisibilite" | "adequation" | "ats" | "competences" | "experiences";

export type CvScore = {
  overall: number; // 0-100
  categories: Record<CvScoreCategory, number>; // 0-100 chacune
  findings: string[]; // observations concretes, une par ligne
};

export type ScoreCvInput = {
  cv: ParsedCv;
  currentHeadline: string | null;
  targetJobTitles: string[]; // criteres.jobTitles, pour l'adequation
};

const ACTION_VERBS_FR = [
  "gere", "gerer", "developpe", "developper", "pilote", "piloter", "anime", "animer",
  "coordonne", "coordonner", "cree", "creer", "concois", "concevoir", "optimise", "optimiser",
  "negocie", "negocier", "dirige", "diriger", "supervise", "superviser", "organise", "organiser",
  "analyse", "analyser", "implemente", "implementer", "ameliore", "ameliorer", "lance", "lancer",
  "conduis", "conduit", "conduire", "realise", "realiser", "encadre", "encadrer", "forme", "former",
  "prospecte", "prospecter", "vends", "vendre", "augmente", "augmenter", "reduis", "reduire",
];

/**
 * Analyse heuristique (sans IA) du CV : verifie des signaux objectifs et
 * observables dans le texte (verbes d'action, chiffres, longueur des
 * sections, sections manquantes, repetitions) plutot que de juger la
 * qualite du contenu lui-meme.
 */
export function scoreCvWithHeuristics(input: ScoreCvInput): CvScore {
  const { cv, currentHeadline, targetJobTitles } = input;
  const findings: string[] = [];

  // --- Impact : verbes d'action + resultats chiffres ---
  const experiences = cv.sections.experiences;
  const withNumber = experiences.filter((e) => /\d/.test(e)).length;
  const withActionVerb = experiences.filter((e) => {
    const normalized = e
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return ACTION_VERBS_FR.some((v) => normalized.includes(v));
  }).length;
  let impact = 40;
  if (experiences.length > 0) {
    impact = Math.round(((withNumber + withActionVerb) / (experiences.length * 2)) * 100);
  }
  if (withNumber === 0 && experiences.length > 0) {
    findings.push("Aucun resultat chiffre detecte dans les experiences (ex: pourcentages, montants, quantites).");
  }
  if (withActionVerb < experiences.length && experiences.length > 0) {
    findings.push("Certaines experiences ne commencent pas par un verbe d'action fort.");
  }

  // --- Lisibilite : longueur des sections, repetitions ---
  const tooLong = experiences.filter((e) => e.length > 280).length;
  const words = experiences.flatMap((e) => e.toLowerCase().split(/\s+/).filter((w) => w.length > 5));
  const wordCounts = new Map<string, number>();
  for (const w of words) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  const repeatedWords = [...wordCounts.entries()].filter(([, count]) => count >= 3);
  let lisibilite = 90;
  if (tooLong > 0) {
    lisibilite -= tooLong * 15;
    findings.push(`${tooLong} experience(s) tres longue(s) (plus de 280 caracteres) : envisage de raccourcir.`);
  }
  if (repeatedWords.length > 0) {
    lisibilite -= 10;
    findings.push(`Mots repetes plusieurs fois dans les experiences : ${repeatedWords.map(([w]) => w).slice(0, 3).join(", ")}.`);
  }
  lisibilite = Math.max(0, Math.min(100, lisibilite));

  // --- Adequation avec les postes recherches ---
  let adequation = 50;
  if (targetJobTitles.length > 0) {
    adequation = computeContentOverlap(cv.rawText, targetJobTitles.join(" "));
  } else {
    findings.push("Aucun intitule de poste enregistre dans tes criteres : impossible d'evaluer l'adequation avec ta recherche.");
  }

  // --- ATS : sections standards presentes ---
  const missingSections: string[] = [];
  if (!currentHeadline) missingSections.push("accroche");
  if (!cv.sections.summary) missingSections.push("resume/profil");
  if (cv.sections.experiences.length === 0) missingSections.push("experiences");
  if (cv.sections.education.length === 0) missingSections.push("formation");
  if (cv.skills.length === 0) missingSections.push("competences");
  if (cv.sections.languages.length === 0) missingSections.push("langues");
  const ats = Math.round(((6 - missingSections.length) / 6) * 100);
  if (missingSections.length > 0) {
    findings.push(`Section(s) manquante(s) ou non detectee(s) : ${missingSections.join(", ")}.`);
  }

  // --- Competences ---
  const competences = Math.min(100, cv.skills.length * 12);
  if (cv.skills.length < 4) {
    findings.push("Peu de competences detectees : verifie qu'elles sont bien listees clairement dans le CV.");
  }

  // --- Experiences ---
  let experiencesScore = Math.min(100, experiences.length * 30);
  if (experiences.length === 0) {
    findings.push("Aucune experience detectee dans le CV.");
    experiencesScore = 0;
  }

  const categories: Record<CvScoreCategory, number> = {
    impact: clamp(impact),
    lisibilite: clamp(lisibilite),
    adequation: clamp(adequation),
    ats: clamp(ats),
    competences: clamp(competences),
    experiences: clamp(experiencesScore),
  };

  const overall = Math.round(
    (categories.impact + categories.lisibilite + categories.adequation + categories.ats + categories.competences + categories.experiences) / 6
  );

  return { overall, categories, findings };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const SCORE_SYSTEM_PROMPT = `Tu es un expert en recrutement qui evalue la QUALITE DE REDACTION d'un CV
(pas la valeur du candidat). Tu juges uniquement ce qui est ecrit : clarte,
impact des formulations, presence de verbes d'action et de resultats
chiffres deja mentionnes, lisibilite, compatibilite ATS (sections
standards presentes, pas de formulation ambigue), pertinence des
competences listees par rapport aux postes recherches, et qualite de la
presentation des experiences.
IMPORTANT : ne juge jamais le contenu factuel (tu ne sais pas si le
candidat est un bon professionnel), seulement sa presentation ecrite. Ne
suppose ni n'invente aucune information absente du texte fourni.

Reponds UNIQUEMENT avec un objet JSON de la forme :
{"categories": {"impact": 0-100, "lisibilite": 0-100, "adequation": 0-100, "ats": 0-100, "competences": 0-100, "experiences": 0-100}, "findings": ["observation courte 1", "observation courte 2", ...]}
5 a 8 "findings" maximum, chacune une phrase courte et actionnable (ex:
"Ajoute un verbe d'action en debut de la 2e experience", "La liste de
competences pourrait inclure des outils plus specifiques"). Pas de texte
hors du JSON.`;

export async function scoreCvWithAi(input: ScoreCvInput): Promise<CvScore> {
  const anthropic = getClient();
  const { cv, currentHeadline, targetJobTitles } = input;

  const userPrompt = `CV :
Accroche : ${currentHeadline ?? "(absente)"}
Resume/profil : ${cv.sections.summary ?? "(absent)"}
Competences listees : ${cv.skills.join(", ") || "(aucune)"}
Experiences :
${cv.sections.experiences.map((e, i) => `${i + 1}. ${e}`).join("\n") || "(aucune)"}
Formation :
${cv.sections.education.join("\n") || "(aucune)"}
Langues : ${cv.sections.languages.join(", ") || "(aucune)"}

Postes recherches par le candidat : ${targetJobTitles.join(", ") || "(non precise)"}

Texte brut complet (contexte) :
"""
${cv.rawText}
"""`;

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 1200,
    thinking: { type: "disabled" },
    system: SCORE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Reponse IA non structuree (JSON attendu)");
  const parsed = JSON.parse(jsonMatch[0]) as { categories?: Partial<Record<CvScoreCategory, number>>; findings?: string[] };

  const categoryKeys: CvScoreCategory[] = ["impact", "lisibilite", "adequation", "ats", "competences", "experiences"];
  const categories = {} as Record<CvScoreCategory, number>;
  for (const key of categoryKeys) {
    const value = parsed.categories?.[key];
    categories[key] = typeof value === "number" ? clamp(value) : 50;
  }

  const overall = Math.round(categoryKeys.reduce((sum, key) => sum + categories[key], 0) / categoryKeys.length);
  const findings = Array.isArray(parsed.findings) ? parsed.findings.filter((f) => typeof f === "string").slice(0, 8) : [];

  return { overall, categories, findings };
}

export async function scoreCv(
  input: ScoreCvInput
): Promise<{ score: CvScore; usedAi: boolean; aiError?: string }> {
  if (isAiEnabled()) {
    try {
      const score = await scoreCvWithAi(input);
      return { score, usedAi: true };
    } catch (err) {
      const aiError = describeAiError(err);
      console.error("Notation IA du CV impossible, repli sur le mode heuristique:", err);
      return { score: scoreCvWithHeuristics(input), usedAi: false, aiError };
    }
  }
  return { score: scoreCvWithHeuristics(input), usedAi: false };
}

// --- Discussion interactive pour preciser le profil de recherche ---
// Contrairement aux fonctions ci-dessus, cette fonctionnalite n'a pas de
// repli heuristique sensible (un "faux" chatbot sans IA n'aiderait pas) :
// elle est simplement indisponible sans cle Anthropic configuree.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type SearchChatContext = {
  existingSearchDescription: string | null;
  jobTitles: string[];
  locations: string[];
  cvEducation: string[];
  cvSkills: string[];
};

function buildSearchChatSystemPrompt(context: SearchChatContext): string {
  return `Tu es un assistant qui discute avec un candidat a l'alternance/apprentissage
pour vraiment comprendre ce qu'il recherche et son parcours, afin
d'ameliorer le matching d'offres et l'adaptation de son CV. Ce doit etre
une VRAIE conversation, pas un questionnaire.

COMMENT REAGIR A CHAQUE MESSAGE DU CANDIDAT (le plus important) :
- Lis attentivement ce qu'il vient de dire et REAGIS d'abord a ca
  concretement, en une courte phrase qui montre que tu as compris et
  retenu l'info precise qu'il a donnee (pas une formule generique du style
  "merci pour cette info" ou "c'est note") : reprends un detail concret
  qu'il a mentionne, rebondis dessus, fais le lien avec ce qu'il a dit
  avant si pertinent.
- Utilise reellement les informations deja donnees dans la conversation
  pour orienter la suite : si le candidat a dit qu'il visait Lyon, ne
  demande pas "et niveau localisation ?" mais quelque chose comme "Tu
  cherches uniquement sur Lyon ou tu es ouvert aux alentours / au
  remote ?". Si il a mentionne son BUT Informatique en 2e annee, appuie-toi
  dessus pour la question suivante plutot que de redemander son niveau
  d'etudes.
- Ensuite seulement, enchaine avec UNE SEULE question de relance (jamais
  plusieurs questions dans le meme message), courte et naturelle.
- Varie tes formulations d'un message a l'autre (n'utilise pas toujours la
  meme structure "Reaction. Question."), comme dans une vraie discussion.
- Reste bref au total : 2 a 4 phrases par message maximum.

Sujets a explorer, dans un ordre naturel qui suit le fil de la discussion
plutot qu'une liste rigide, et sans jamais reposer une question sur ce qui
est deja connu (voir contexte ci-dessous) : le metier/domaine recherche, le
type d'entreprise ou secteur souhaite, la localisation et la mobilite, le
rythme d'alternance s'il le connait deja, son parcours scolaire actuel
(niveau d'etudes, filiere, etablissement), la formation/le diplome qu'il
prepare ou vise, ses experiences deja faites (stages, jobs, projets), et
ses eventuelles contraintes personnelles.

REGLE ABSOLUE : ne jamais affirmer ou supposer une information que le
candidat n'a pas donnee lui-meme dans la conversation. Tu peux reformuler
ou reprendre ce qu'il dit, jamais inventer.

Quand tu estimes avoir assez d'informations (generalement apres 5 a 8
echanges), dis-le explicitement, en resumant en une phrase ce que tu as
retenu de lui, et invite-le a cliquer sur "Terminer la discussion" quand il
le souhaite (sans l'y forcer : il peut continuer a preciser s'il le
souhaite).

CONTEXTE DEJA CONNU (ne repose jamais une question sur ce qui est deja
present ici, mais tu peux t'en servir pour rebondir) :
- Description de recherche deja enregistree : ${context.existingSearchDescription || "(aucune)"}
- Intitules de poste deja enregistres : ${context.jobTitles.join(", ") || "(aucun)"}
- Localisations deja enregistrees : ${context.locations.join(", ") || "(aucune)"}
- Formation deja detectee dans le CV : ${context.cvEducation.join(" ; ") || "(aucune)"}
- Competences deja detectees dans le CV : ${context.cvSkills.join(", ") || "(aucune)"}

Si c'est le tout debut de la conversation (aucun message precedent), lance
la discussion avec une premiere question adaptee a ce contexte (par
exemple, si la formation est deja connue via le CV, ne redemande pas le
niveau d'etudes mais confirme/precise plutot ce qui manque), sans phrase
de reaction avant puisqu'il n'y a encore rien a quoi reagir.`;
}

export async function chatAboutSearchProfileWithAi(
  messages: ChatMessage[],
  context: SearchChatContext
): Promise<string> {
  const anthropic = getClient();

  const apiMessages =
    messages.length > 0
      ? messages
      : [{ role: "user" as const, content: "(Debut de la conversation, pose ta premiere question.)" }];

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 400,
    thinking: { type: "disabled" },
    system: buildSearchChatSystemPrompt(context),
    messages: apiMessages,
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");
  return textBlock.text.trim();
}

export async function chatSearchProfileTurn(messages: ChatMessage[], context: SearchChatContext): Promise<string> {
  if (!isAiEnabled()) {
    throw new Error("Cette fonctionnalite necessite une cle API Anthropic configuree (ANTHROPIC_API_KEY).");
  }
  try {
    return await chatAboutSearchProfileWithAi(messages, context);
  } catch (err) {
    throw new Error(describeAiError(err));
  }
}

const FINALIZE_SEARCH_CHAT_SYSTEM_PROMPT = `Tu resumes une conversation entre un assistant et un candidat a
l'alternance/apprentissage, dans le but de produire deux choses :
1. Un paragraphe "searchDescription", en francais, qui synthetise
   CONCRETEMENT et PRECISEMENT ce que le candidat recherche (metier,
   secteur, localisation, rythme, type d'entreprise, contraintes) ET son
   parcours/sa formation, pour servir de contexte au matching d'offres et
   a l'adaptation de CV. Reprends les termes et details specifiques
   reellement donnes par le candidat (villes, technologies, noms de
   filiere/diplome, secteurs...) plutot que de rester vague ou generique :
   ce texte est compare mot a mot aux descriptions d'offres reelles pour
   affiner le score de matching, des details concrets et specifiques le
   rendent utile, des generalites vagues ne servent a rien.
2. Une liste "educationAdditions" de faits NOUVEAUX sur son parcours
   scolaire/formation mentionnes dans la conversation, qui ne figurent PAS
   deja dans la formation deja connue (fournie ci-dessous). Chaque element
   est une ligne courte, style CV (ex: "Etudiant en BUT Informatique, IUT
   de Lyon (2024-2026)"). Liste vide si rien de nouveau a ajouter.

REGLE ABSOLUE : n'utilise QUE des informations effectivement mentionnees
par le candidat (messages "Candidat") dans la conversation fournie.
N'invente rien, ne suppose rien, et n'arrondis pas un detail precis en
formulation vague.

Reponds UNIQUEMENT avec un objet JSON de la forme :
{"searchDescription": "...", "educationAdditions": ["...", ...]}`;

export async function finalizeSearchProfileWithAi(
  messages: ChatMessage[],
  context: SearchChatContext
): Promise<{ searchDescription: string; educationAdditions: string[] }> {
  const anthropic = getClient();

  const transcript = messages.map((m) => `${m.role === "user" ? "Candidat" : "Assistant"} : ${m.content}`).join("\n");

  const userPrompt = `Formation deja connue (CV) : ${context.cvEducation.join(" ; ") || "(aucune)"}
Description de recherche deja enregistree : ${context.existingSearchDescription || "(aucune)"}

Conversation :
"""
${transcript}
"""`;

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 800,
    thinking: { type: "disabled" },
    system: FINALIZE_SEARCH_CHAT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Reponse IA non structuree (JSON attendu)");
  const parsed = JSON.parse(jsonMatch[0]) as { searchDescription?: string; educationAdditions?: string[] };

  const searchDescription = typeof parsed.searchDescription === "string" ? parsed.searchDescription.trim() : "";
  const educationAdditions = Array.isArray(parsed.educationAdditions)
    ? parsed.educationAdditions.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
    : [];

  if (!searchDescription) throw new Error("Reponse IA sans description de recherche");

  return { searchDescription, educationAdditions };
}

export async function finalizeSearchProfile(
  messages: ChatMessage[],
  context: SearchChatContext
): Promise<{ searchDescription: string; educationAdditions: string[] }> {
  if (!isAiEnabled()) {
    throw new Error("Cette fonctionnalite necessite une cle API Anthropic configuree (ANTHROPIC_API_KEY).");
  }
  if (messages.length === 0) {
    throw new Error("La conversation est vide.");
  }
  try {
    return await finalizeSearchProfileWithAi(messages, context);
  } catch (err) {
    throw new Error(describeAiError(err));
  }
}

// --- Verification d'un critere obligatoire libre (ex: "dimension
// internationale") sur une offre, a partir du titre, des missions et de ce
// que le texte laisse deviner de l'entreprise. Utilise pour penaliser
// fortement (mais jamais bloquer completement) les offres qui ne semblent
// pas correspondre - voir matching.ts.

const MANDATORY_CRITERIA_SYSTEM_PROMPT = `Tu determines si une offre d'emploi correspond a un critere obligatoire donne
par un candidat, a partir de l'intitule du poste, de la description des
missions, et de ce que le texte laisse deduire du profil de l'entreprise.
N'utilise jamais d'information externe que tu inventerais : base-toi
uniquement sur le texte fourni.

Exemple : pour le critere "dimension internationale", reponds OUI si
l'offre mentionne des missions a l'etranger, des clients/equipes
internationaux, une entreprise presente dans plusieurs pays, l'usage
regulier d'une langue etrangere en contexte professionnel, etc. Reponds
NON si rien dans le texte ne l'indique, meme si ce n'est pas
explicitement exclu (le doute ne compte pas comme une correspondance).

Reponds UNIQUEMENT par un seul mot : OUI ou NON.`;

export async function checkMandatoryCriteriaWithAi(
  criteriaText: string,
  offer: { title: string; company: string | null; description: string }
): Promise<boolean> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 5,
    thinking: { type: "disabled" },
    system: MANDATORY_CRITERIA_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Critere obligatoire du candidat : "${criteriaText}"

Offre :
Intitule : ${offer.title}
Entreprise : ${offer.company ?? "non precisee"}
Description :
"""
${offer.description.slice(0, 2000)}
"""`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");
  return textBlock.text.trim().toUpperCase().startsWith("OUI");
}

/**
 * Repli sans IA : cherche si un mot significatif du critere (ex: "international"
 * pour "dimension internationale obligatoire") apparait tel quel dans le
 * titre/la description de l'offre. Beaucoup plus faible que la verification
 * IA (une offre peut evoquer l'international sans jamais utiliser ce mot),
 * mais mieux que ne rien verifier du tout.
 */
export function checkMandatoryCriteriaWithHeuristic(
  criteriaText: string,
  offer: { title: string; description: string }
): boolean {
  const criteriaWords = significantWords(criteriaText);
  if (criteriaWords.size === 0) return true;
  const offerWords = significantWords(`${offer.title} ${offer.description}`);
  for (const w of criteriaWords) {
    if (offerWords.has(w)) return true;
  }
  return false;
}

/**
 * Retourne null si aucun critere obligatoire n'est defini (rien a
 * verifier). Utilise l'IA si disponible, avec repli automatique par
 * mots-cles en cas d'erreur ou d'absence de cle API - ne bloque jamais la
 * recuperation d'offres.
 */
export async function checkMandatoryCriteria(
  criteriaText: string | null | undefined,
  offer: { title: string; company: string | null; description: string }
): Promise<boolean | null> {
  const trimmed = criteriaText?.trim();
  if (!trimmed) return null;

  if (isAiEnabled()) {
    try {
      return await checkMandatoryCriteriaWithAi(trimmed, offer);
    } catch (err) {
      console.error("Verification IA du critere obligatoire impossible, repli sur mots-cles:", err);
      return checkMandatoryCriteriaWithHeuristic(trimmed, offer);
    }
  }
  return checkMandatoryCriteriaWithHeuristic(trimmed, offer);
}

// --- Decoupage du CV en sections par IA, en remplacement du decoupage
// heuristique base sur des intitules de section attendus (voir cvParser.ts).
// Un CV avec une mise en page inhabituelle (pas d'intitule "Experience",
// sections dans un ordre atypique, CV en anglais, etc.) est mal decoupe par
// l'heuristique, ce qui degrade tout ce qui en depend (score, suggestions,
// matching). L'IA comprend le contenu independamment de la mise en forme.

const CV_PARSE_SYSTEM_PROMPT = `Tu decoupes le texte brut d'un CV (extrait d'un PDF, la mise en page
d'origine est donc perdue : sauts de ligne parfois au milieu d'une phrase,
colonnes eventuellement melangees) en sections structurees.

REGLE ABSOLUE : tu ne dois QUE recopier des extraits VERBATIM (mot pour
mot, caracteres identiques) du texte fourni. Interdiction absolue de
reformuler, resumer, traduire, corriger une faute, ajouter ou deduire une
information. La seule transformation autorisee est de rejoindre en une
seule ligne des mots coupes par un saut de ligne au milieu d'une meme
phrase/puce (artefact d'extraction PDF), sans changer un seul mot.

Sections a produire :
- "summary" : le paragraphe de profil/accroche en debut de CV s'il existe
  (chaine ou null si absent).
- "experiences" : un element par experience professionnelle, stage,
  alternance ou projet distinct (intitule + entreprise + dates + description
  regroupes en une seule chaine par experience, dans l'ordre du CV).
- "education" : un element par diplome/formation/etablissement distinct.
- "languages" : un element par langue mentionnee (ex: "Anglais - courant"),
  reprise telle quelle.

Identifie les sections par leur CONTENU (ce dont ca parle) plutot que par
un intitule attendu : un CV peut ne pas avoir d'intitule de section du tout,
avoir des intitules en anglais, ou un ordre inhabituel.

Reponds UNIQUEMENT avec un objet JSON de la forme :
{"summary": "..."|null, "experiences": ["...", ...], "education": ["...", ...], "languages": ["...", ...]}
Pas de texte ni de markdown autour. Liste vide si aucun element trouve pour
une section (jamais null pour les listes, seul "summary" peut etre null).`;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Garde-fou anti-fabrication : un extrait n'est retenu que s'il figure
 * effectivement, mot pour mot (aux espaces/sauts de ligne pres), dans le
 * texte brut source. Toute reformulation ou invention de l'IA est ainsi
 * rejetee plutot que silencieusement acceptee.
 */
export function isVerbatimExtract(candidate: string, normalizedSource: string): boolean {
  const normalized = normalizeWhitespace(candidate);
  return normalized.length > 0 && normalizedSource.includes(normalized);
}

export async function parseCvSectionsWithAi(rawText: string): Promise<ParsedCv["sections"]> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    system: CV_PARSE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Texte brut du CV :\n"""\n${rawText}\n"""` }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("Reponse IA vide");

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Reponse IA non structuree (JSON attendu)");
  const parsed = JSON.parse(jsonMatch[0]) as {
    summary?: string | null;
    experiences?: unknown;
    education?: unknown;
    languages?: unknown;
  };

  const normalizedSource = normalizeWhitespace(rawText);

  const summary =
    typeof parsed.summary === "string" && isVerbatimExtract(parsed.summary, normalizedSource)
      ? parsed.summary.trim()
      : null;

  const toVerbatimList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string" && isVerbatimExtract(v, normalizedSource)).map((v) => v.trim())
      : [];

  return {
    summary,
    experiences: toVerbatimList(parsed.experiences),
    education: toVerbatimList(parsed.education),
    languages: toVerbatimList(parsed.languages),
  };
}

export async function parseCvWithAi(rawText: string): Promise<ParsedCv> {
  const sections = await parseCvSectionsWithAi(rawText);
  return { rawText, skills: extractSkills(rawText), sections };
}

export async function parseCv(rawText: string): Promise<{ parsed: ParsedCv; usedAi: boolean; aiError?: string }> {
  if (isAiEnabled()) {
    try {
      const parsed = await parseCvWithAi(rawText);
      return { parsed, usedAi: true };
    } catch (err) {
      const aiError = describeAiError(err);
      console.error("Decoupage IA du CV impossible, repli sur le mode heuristique:", err);
      return { parsed: parseCvText(rawText), usedAi: false, aiError };
    }
  }
  return { parsed: parseCvText(rawText), usedAi: false };
}
