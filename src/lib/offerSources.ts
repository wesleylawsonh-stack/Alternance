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

// Nombre de resultats demandes par source a chaque recuperation. Plus haut
// que les valeurs par defaut de chaque adaptateur (20) pour proposer plus
// d'offres au candidat. France Travail accepte jusqu'a 150 resultats par
// appel (parametre range) ; Adzuna plafonne results_per_page a 50.
const FRANCE_TRAVAIL_LIMIT = 100;
const ADZUNA_LIMIT = 50;
const LBA_LIMIT = 50;

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
      fetchFranceTravailOffers(criteria, FRANCE_TRAVAIL_LIMIT)
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
      fetchAdzunaOffers(criteria, ADZUNA_LIMIT)
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
      fetchLbaOffers(criteria, LBA_LIMIT)
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
