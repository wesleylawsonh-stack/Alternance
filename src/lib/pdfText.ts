import { getDocumentProxy, extractTextItems } from "unpdf";

export type ExtractedTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

// Tolerance (en unites PDF) sur la coordonnee Y avant de considerer que
// deux items consecutifs sont sur des lignes differentes.
const LINE_BREAK_TOLERANCE = 2;
// Ecart horizontal minimal (proportion de la taille de police) entre deux
// items d'une meme ligne avant d'inserer un espace entre eux.
const WORD_GAP_RATIO = 0.15;

/**
 * Reconstitue le texte d'une page a partir des items positionnes de pdf.js
 * plutot que de se fier au flag `hasEOL` fourni par la librairie : ce flag
 * est un heuristique de pdf.js base sur la structure interne du flux PDF,
 * peu fiable sur des PDF generes par positionnement absolu du texte
 * (frequent avec les outils de creation de CV comme Canva, Word "Export en
 * PDF", ou certains generateurs en ligne). Quand hasEOL est manque a tort,
 * deux lignes distinctes se retrouvent collees sans le moindre espace
 * (ex: "...AVRIL 2025Pilote le suivi..." au lieu de "...AVRIL 2025" puis
 * "Pilote le suivi..."), ce qui degrade tout ce qui exploite ensuite ce
 * texte (decoupage en sections, competences, adaptation IA...).
 * On se base donc directement sur le changement reel de coordonnee Y pour
 * detecter un saut de ligne (signal plus fondamental que hasEOL), et sur
 * l'ecart horizontal entre deux items d'une meme ligne pour decider si un
 * espace doit les separer (un mot coupe en plusieurs items par une
 * variation de crenage ne doit pas etre espace en son milieu).
 */
export function reconstructPageText(items: ExtractedTextItem[]): string {
  let text = "";
  let prev: ExtractedTextItem | null = null;

  for (const item of items) {
    if (!item.str) continue;

    if (prev) {
      const sameLine = Math.abs(item.y - prev.y) <= LINE_BREAK_TOLERANCE;
      if (!sameLine) {
        text += "\n";
      } else {
        const gap = item.x - (prev.x + prev.width);
        if (gap > prev.fontSize * WORD_GAP_RATIO) text += " ";
      }
    }

    text += item.str;
    prev = item;
  }

  return text;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { items } = await extractTextItems(pdf);
  return items
    .map((pageItems) => reconstructPageText(pageItems))
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
