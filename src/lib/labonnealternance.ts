// Adaptateur pour l'API "La bonne alternance" (Mission Apprentissage /
// beta.gouv.fr) : gratuite (usage non commercial), specifique aux offres
// d'alternance/apprentissage, agregeant France Travail et d'autres
// diffuseurs. Documentation (schema verifie via le swagger interactif) :
// https://api.apprentissage.beta.gouv.fr/fr/documentation-technique#tag/Offre-Emploi/operation/jobSearch
//
// Authentification : header "Authorization: Bearer <cle>". Une cle de type
// "sandbox" s'obtient automatiquement depuis l'espace developpeurs ; une
// cle "production" necessite une demande par email a
// support_api@apprentissage.beta.gouv.fr. Voir README pour la procedure.

import type { ExternalOffer } from "./franceTravail";
import { geocode } from "./geocode";

export type LbaCriteria = {
  jobTitles: string[];
  locations: string[];
  radiusKm: number | null;
};

const SEARCH_URL = "https://api.apprentissage.beta.gouv.fr/job/v1/search";

export function isLbaConfigured(): boolean {
  return Boolean(process.env.LBA_API_KEY);
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) return `${err.message} (${cause.message})`;
    return err.message;
  }
  return String(err);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new Error(`Requete reseau vers La bonne alternance echouee : ${describeNetworkError(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}

type JobOfferRead = {
  identifier?: { id?: string; partner_job_id?: string; partner_label?: string };
  workplace?: { name?: string; legal_name?: string; location?: { address?: string } };
  apply?: { url?: string };
  contract?: { type?: string[] };
  offer?: { title?: string; description?: string; publication?: { creation?: string } };
};

export async function fetchLbaOffers(criteria: LbaCriteria, limit = 20): Promise<ExternalOffer[]> {
  if (!isLbaConfigured()) {
    throw new Error("L'integration La bonne alternance n'est pas configuree (LBA_API_KEY manquant).");
  }

  const params = new URLSearchParams();
  if (criteria.locations.length) {
    const point = await geocode(criteria.locations[0]);
    if (point) {
      params.set("longitude", String(point.lon));
      params.set("latitude", String(point.lat));
      params.set("radius", String(Math.min(200, Math.max(0, criteria.radiusKm ?? 30))));
    }
  }
  // Pas de filtre "romes" (codes ROME) : on ne dispose pas d'une table de
  // correspondance intitule de poste -> code ROME. Sans lat/lon la
  // recherche couvre toute la France ; le matching local (mots-cles,
  // distance) affine ensuite la pertinence.

  const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${process.env.LBA_API_KEY}` },
  });
  const rawText = await res.text();

  if (!res.ok) {
    throw new Error(`Recherche d'offres La bonne alternance echouee (${res.status}): ${rawText.slice(0, 300)}`);
  }

  let json: { jobs?: JobOfferRead[] };
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(
      `La bonne alternance : reponse inattendue (non-JSON, statut ${res.status}) : ${rawText.slice(0, 200)}`
    );
  }

  return (json.jobs ?? []).slice(0, limit).map((job) => ({
    externalId: `lba:${job.identifier?.id ?? job.identifier?.partner_job_id ?? crypto.randomUUID()}`,
    title: job.offer?.title ?? "Offre La bonne alternance",
    company: job.workplace?.name ?? job.workplace?.legal_name ?? null,
    companyLogoUrl: null,
    location: job.workplace?.location?.address ?? null,
    url: job.apply?.url ?? null,
    description: job.offer?.description ?? "",
    contractType: job.contract?.type?.length ? job.contract.type.join(", ") : null,
    postedAt: job.offer?.publication?.creation ?? null,
  }));
}
