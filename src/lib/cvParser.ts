import { extractSkills } from "./skills";

export type ParsedCv = {
  rawText: string;
  skills: string[];
  sections: {
    summary: string | null;
    experiences: string[]; // paragraphs/bullets found under "experience"
    education: string[];
    languages: string[];
  };
};

const SECTION_HEADERS: Record<keyof ParsedCv["sections"], RegExp> = {
  summary: /^(profil|a propos|à propos|resume|résumé|summary|objectif)/i,
  experiences: /^(experiences?|expérience?s?|parcours professionnel|experience professionnelle|expérience professionnelle)/i,
  education: /^(formations?|education|diplomes?|diplômes?|scolarite|scolarité)/i,
  languages: /^(langues?|languages?)/i,
};

/**
 * Analyse heuristique (sans IA) d'un texte de CV brut : decoupe en sections
 * usuelles a partir des intitules courants, puis extrait les competences
 * connues du dictionnaire. Ne fabrique aucune information : tout ce qui est
 * retourne provient litteralement du texte source.
 */
export function parseCvText(rawText: string): ParsedCv {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const sections: ParsedCv["sections"] = {
    summary: null,
    experiences: [],
    education: [],
    languages: [],
  };

  let currentKey: keyof ParsedCv["sections"] | null = null;
  const buffers: Record<keyof ParsedCv["sections"], string[]> = {
    summary: [],
    experiences: [],
    education: [],
    languages: [],
  };

  for (const line of lines) {
    const shortLine = line.length < 40;
    let matchedHeader: keyof ParsedCv["sections"] | null = null;
    if (shortLine) {
      for (const key of Object.keys(SECTION_HEADERS) as (keyof ParsedCv["sections"])[]) {
        if (SECTION_HEADERS[key].test(line)) {
          matchedHeader = key;
          break;
        }
      }
    }

    if (matchedHeader) {
      currentKey = matchedHeader;
      continue;
    }

    if (currentKey) {
      buffers[currentKey].push(line);
    }
  }

  sections.summary = buffers.summary.length ? buffers.summary.join(" ") : null;
  sections.experiences = groupBullets(buffers.experiences);
  sections.education = groupBullets(buffers.education);
  sections.languages = buffers.languages;

  const skills = extractSkills(rawText);

  return { rawText, skills, sections };
}

// Regroupe des lignes consecutives en "blocs" separes par des lignes qui
// ressemblent a un nouvel intitule (courtes, sans ponctuation finale).
function groupBullets(lines: string[]): string[] {
  return lines.filter((l) => l.length > 0);
}
