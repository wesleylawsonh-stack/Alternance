import type { CvContent } from "./cvTemplate";
import type { CvEditProposal } from "./ai";

export type EditDecision = {
  id: string;
  action: "accept" | "reject";
  editedText?: string; // present quand l'utilisateur a modifie manuellement le texte propose
};

/**
 * Applique les decisions de l'utilisateur (accepter/modifier/refuser) sur
 * chaque proposition, par-dessus le contenu de base du CV. Rien n'est
 * modifie pour les propositions refusees ou absentes des decisions.
 */
export function applyCvEditDecisions(
  base: CvContent,
  currentHeadline: string | null,
  proposals: CvEditProposal[],
  decisions: EditDecision[]
): { content: CvContent; headline: string | null } {
  const decisionMap = new Map(decisions.map((d) => [d.id, d]));
  let headline = currentHeadline;
  let summary = base.summary;
  const skills = [...base.skills];
  const experiences = [...base.experiences];

  for (const proposal of proposals) {
    const decision = decisionMap.get(proposal.id);
    if (!decision || decision.action !== "accept") continue;
    const finalText = decision.editedText?.trim() || proposal.proposed;

    if (proposal.section === "HEADLINE") {
      headline = finalText;
    } else if (proposal.section === "SUMMARY") {
      summary = finalText;
    } else if (proposal.section === "SKILLS") {
      const requested = finalText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // Meme filet de securite qu'a la generation : jamais de competence
      // qui n'etait pas deja dans le CV original, meme apres une
      // modification manuelle.
      const knownSet = new Set(base.skills.map((s) => s.toLowerCase()));
      const kept = requested.filter((s) => knownSet.has(s.toLowerCase()));
      const keptSet = new Set(kept.map((s) => s.toLowerCase()));
      const missing = base.skills.filter((s) => !keptSet.has(s.toLowerCase()));
      skills.splice(0, skills.length, ...kept, ...missing);
    } else if (proposal.section === "EXPERIENCE") {
      const index = Number(proposal.id.slice("experience-".length));
      if (Number.isInteger(index) && index >= 0 && index < experiences.length) {
        experiences[index] = finalText;
      }
    }
  }

  return {
    content: { headline, summary, skills, experiences, education: base.education, languages: base.languages },
    headline,
  };
}

function slugWord(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

/**
 * Genere un nom de version lisible, du style "CV_Loreal_BusinessDeveloper"
 * pour une adaptation a une offre, ou "CV_ameliore_JJ-MM-AAAA" pour une
 * amelioration generale.
 */
export function cvVersionLabel(kind: "IMPROVED" | "OFFER_ADAPTED", company?: string | null, title?: string | null): string {
  if (kind === "OFFER_ADAPTED" && (company || title)) {
    const parts = [company, title].filter(Boolean).map((s) => slugWord(s as string));
    return `CV_${parts.join("_")}`;
  }
  const date = new Date().toLocaleDateString("fr-FR").replace(/\//g, "-");
  return `CV_ameliore_${date}`;
}
