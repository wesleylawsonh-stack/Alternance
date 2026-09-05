// Point d'entree unique regroupant toutes les sources d'offres legales
// (API officielles a cle). Chaque source est independante et optionnelle :
// si aucune n'est configuree, la recuperation automatique reste
// desactivee (voir isAnySourceConfigured). Ajouter une source = ajouter un
// adaptateur (voir franceTravail.ts / adzuna.ts) et le brancher ici.

import { fetchFranceTravailOffers, isFranceTravailConfigured, type ExternalOffer } from "./franceTravail";
import { fetchAdzunaOffers, isAdzunaConfigured } from "./adzuna";
import { fetchLbaOffers, isLbaConfigured } from "./labonnealternance";

export type { ExternalOffer };

export type OfferSourceCriteria = {
  jobTitles: string[];
  locations: string[];
  contractTypes: string[];
  radiusKm: number | null;
};

export function isAnySourceConfigured(): boolean {
  return isFranceTravailConfigured() || isAdzunaConfigured() || isLbaConfigured();
}

export function configuredSourceNames(): string[] {
  const names: string[] = [];
  if (isFranceTravailConfigured()) names.push("france_travail");
  if (isAdzunaConfigured()) names.push("adzuna");
  if (isLbaConfigured()) names.push("lba");
  return names;
}

/**
 * Interroge toutes les sources configurees en parallele. Une source qui
 * echoue (panne, quota, credentials invalides) n'empeche pas les autres de
 * remonter des resultats : l'erreur est loggee et la source est simplement
 * ignoree pour cette execution.
 */
export async function fetchAllExternalOffers(
  criteria: OfferSourceCriteria
): Promise<{ offers: (ExternalOffer & { source: string })[]; sourceErrors: string[] }> {
  const tasks: Array<Promise<(ExternalOffer & { source: string })[]>> = [];
  const sourceErrors: string[] = [];

  if (isFranceTravailConfigured()) {
    tasks.push(
      fetchFranceTravailOffers(criteria)
        .then((offers) => offers.map((o) => ({ ...o, source: "france_travail" })))
        .catch((err) => {
          console.error("Erreur source France Travail:", err);
          sourceErrors.push(`France Travail: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        })
    );
  }

  if (isAdzunaConfigured()) {
    tasks.push(
      fetchAdzunaOffers(criteria)
        .then((offers) => offers.map((o) => ({ ...o, source: "adzuna" })))
        .catch((err) => {
          console.error("Erreur source Adzuna:", err);
          sourceErrors.push(`Adzuna: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        })
    );
  }

  if (isLbaConfigured()) {
    tasks.push(
      fetchLbaOffers(criteria)
        .then((offers) => offers.map((o) => ({ ...o, source: "lba" })))
        .catch((err) => {
          console.error("Erreur source La bonne alternance:", err);
          sourceErrors.push(`La bonne alternance: ${err instanceof Error ? err.message : String(err)}`);
          return [];
        })
    );
  }

  const results = await Promise.all(tasks);
  return { offers: results.flat(), sourceErrors };
}
