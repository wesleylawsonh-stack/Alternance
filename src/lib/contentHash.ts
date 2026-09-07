import { createHash } from "crypto";

/**
 * Empreinte du contenu d'une offre (titre + entreprise + description),
 * normalisee (minuscules, espaces compresses) pour detecter les doublons
 * meme quand ils proviennent de sources differentes ou ont un URL/ID
 * externe legerement different.
 */
export function computeOfferContentHash(title: string, company: string | null, description: string): string {
  const normalized = [title, company ?? "", description]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}
