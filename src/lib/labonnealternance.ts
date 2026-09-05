// Adaptateur pour l'API "La bonne alternance" (Mission Apprentissage /
// beta.gouv.fr) : gratuite, reservee a un usage non commercial, specifique
// aux offres d'alternance/apprentissage, agregeant France Travail et
// d'autres diffuseurs. Documentation :
// https://labonnealternance.apprentissage.beta.gouv.fr/espace-developpeurs
//
// IMPORTANT : contrairement a franceTravail.ts et adzuna.ts, le detail
// exact de cette API (endpoint, parametres, forme de la reponse) n'a pas
// pu etre verifie directement : tous les domaines *.beta.gouv.fr et
// data.gouv.fr sont inaccessibles depuis l'environnement de developpement
// utilise pour ecrire cet adaptateur. C'est donc une premiere tentative,
// desactivee par defaut (LBA_ENABLED), a affiner en conditions reelles a
// partir des erreurs remontees par extractJobsArray()/pickString() ci-dessous,
// qui remontent toujours un extrait brut de la reponse en cas de forme
// inattendue (meme principe que la detection des reponses non-JSON dans
// franceTravail.ts).

import type { ExternalOffer } from "./franceTravail";
import { geocode } from "./geocode";

export type LbaCriteria = {
  jobTitles: string[];
  locations: string[];
  radiusKm: number | null;
};

const SEARCH_URL = "https://api.apprentissage.beta.gouv.fr/v3/jobs/search";

export function isLbaConfigured(): boolean {
  return process.env.LBA_ENABLED === "true";
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) return `${err.message} (${cause.message})`;
    return err.message;
  }
  return String(err);
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    throw new Error(`Requete reseau vers La bonne alternance echouee : ${describeNetworkError(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}

type RawJob = Record<string, unknown>;

// Les noms de champs exacts ne sont pas confirmes : on essaie plusieurs
// chemins plausibles pour chaque information et on ne bloque jamais sur un
// champ manquant (une offre incomplete vaut mieux qu'une offre perdue).
function pickString(obj: RawJob, paths: string[][]): string | null {
  for (const path of paths) {
    let cur: unknown = obj;
    for (const key of path) {
      cur = cur && typeof cur === "object" ? (cur as RawJob)[key] : undefined;
      if (cur === undefined) break;
    }
    if (typeof cur === "string" && cur.trim()) return cur;
  }
  return null;
}

function extractJobsArray(json: unknown): RawJob[] | null {
  if (Array.isArray(json)) return json as RawJob[];
  if (json && typeof json === "object") {
    for (const key of ["jobs", "results", "offres", "data"]) {
      const val = (json as RawJob)[key];
      if (Array.isArray(val)) return val as RawJob[];
    }
  }
  return null;
}

export async function fetchLbaOffers(criteria: LbaCriteria, limit = 20): Promise<ExternalOffer[]> {
  if (!isLbaConfigured()) {
    throw new Error('L\'integration La bonne alternance n\'est pas activee (LBA_ENABLED != "true").');
  }
  if (criteria.locations.length === 0) {
    // Cette API cherche autour d'un point geographique : sans localisation
    // dans les criteres, on ne peut pas l'interroger utilement (ce n'est
    // pas une erreur, juste une source qui ne s'applique pas encore).
    return [];
  }

  const point = await geocode(criteria.locations[0]);
  if (!point) return [];

  const params = new URLSearchParams({
    longitude: String(point.lon),
    latitude: String(point.lat),
    radius: String(criteria.radiusKm ?? 30),
    caller: "monalternance-perso",
  });

  const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`);
  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(`Recherche d'offres La bonne alternance echouee (${res.status}): ${rawText.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(
      `La bonne alternance : reponse inattendue (non-JSON, statut ${res.status}) : ${rawText.slice(0, 200)}`
    );
  }

  const jobs = extractJobsArray(json);
  if (!jobs) {
    const keys = json && typeof json === "object" ? Object.keys(json as RawJob).join(", ") : typeof json;
    throw new Error(`La bonne alternance : forme de reponse inattendue, champs disponibles : ${keys}`);
  }

  return jobs.slice(0, limit).map((job, i) => {
    const id = pickString(job, [["id"], ["_id"], ["jobId"]]) ?? `lba-${i}`;
    return {
      externalId: `lba:${id}`,
      title: pickString(job, [["title"], ["intitule"], ["offer", "title"]]) ?? "Offre La bonne alternance",
      company: pickString(job, [["company", "name"], ["entreprise", "nom"], ["companyName"]]),
      companyLogoUrl: pickString(job, [["company", "logo"], ["entreprise", "logo"]]),
      location: pickString(job, [["place", "city"], ["lieu", "libelle"], ["location"]]),
      url: pickString(job, [["url"], ["applicationUrl"], ["contact", "url"]]),
      description: pickString(job, [["description"], ["offer", "description"]]) ?? "",
      contractType: pickString(job, [["contract", "type"], ["typeContrat"], ["contractType"]]),
      postedAt: pickString(job, [["createdAt"], ["dateCreation"], ["postedAt"]]),
    };
  });
}
