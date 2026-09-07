// Adaptateur pour l'API publique Adzuna (https://developer.adzuna.com/), un
// agregateur d'offres qui expose une API officielle avec cle gratuite
// (usage conforme a ses conditions, contrairement au scraping de sites
// comme LinkedIn/Indeed/Welcome to the Jungle). Necessite la creation d'une
// application sur developer.adzuna.com puis ADZUNA_APP_ID / ADZUNA_APP_KEY
// dans .env. Desactive si ces variables sont absentes.

import type { ExternalOffer } from "./franceTravail";

export type AdzunaCriteria = {
  jobTitles: string[];
  locations: string[];
};

// Adzuna plafonne "results_per_page" a 50 (limite documentee de leur API),
// mais expose chaque page suivante via un numero dans l'URL elle-meme
// (/search/1, /search/2...) : demander plus de 50 resultats revient donc a
// interroger plusieurs pages en parallele et a les concatener, toujours via
// le meme endpoint officiel documente.
const BASE_URL = "https://api.adzuna.com/v1/api/jobs/fr/search";
const MAX_RESULTS_PER_PAGE = 50;

export function isAdzunaConfigured(): boolean {
  return Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);
}

async function fetchAdzunaPage(criteria: AdzunaCriteria, page: number, resultsPerPage: number): Promise<ExternalOffer[]> {
  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID!,
    app_key: process.env.ADZUNA_APP_KEY!,
    results_per_page: String(resultsPerPage),
    "content-type": "application/json",
  });
  if (criteria.jobTitles.length) params.set("what", criteria.jobTitles.join(" "));
  if (criteria.locations.length) params.set("where", criteria.locations[0]);

  const res = await fetch(`${BASE_URL}/${page}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Recherche d'offres Adzuna echouee (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    results?: Array<{
      id: string;
      title: string;
      company?: { display_name?: string };
      location?: { display_name?: string };
      description?: string;
      contract_type?: string;
      contract_time?: string;
      created?: string;
      redirect_url?: string;
    }>;
  };

  return (json.results ?? []).map((o) => ({
    externalId: `adzuna:${o.id}`,
    title: o.title,
    company: o.company?.display_name ?? null,
    companyLogoUrl: null,
    location: o.location?.display_name ?? null,
    url: o.redirect_url ?? null,
    description: o.description ?? "",
    contractType: o.contract_type ?? o.contract_time ?? null,
    postedAt: o.created ?? null,
  }));
}

export async function fetchAdzunaOffers(criteria: AdzunaCriteria, limit = 20): Promise<ExternalOffer[]> {
  if (!isAdzunaConfigured()) {
    throw new Error("L'integration Adzuna n'est pas configuree (ADZUNA_APP_ID / ADZUNA_APP_KEY manquants).");
  }

  const pageCount = Math.max(1, Math.ceil(limit / MAX_RESULTS_PER_PAGE));
  const resultsPerPage = Math.min(limit, MAX_RESULTS_PER_PAGE);

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => fetchAdzunaPage(criteria, i + 1, resultsPerPage))
  );

  return pages.flat().slice(0, limit);
}
