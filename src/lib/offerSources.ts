// Point d'entree unique regroupant toutes les sources d'offres legales
// (API officielles a cle). Chaque source est independante et optionnelle :
// si aucune n'est configuree, la recuperation automatique reste
// desactivee (voir isAnySourceConfigured). Ajouter une source = ajouter un
// adaptateur (voir franceTravail.ts / adzuna.ts) et le brancher ici.

import { fetchFranceTravailOffers, isFranceTravailConfigured, type ExternalOffer } from "./franceTravail";
import { fetchAdzunaOffers, isAdzunaConfigured, type AdzunaCriteria } from "./adzuna";
import { fetchLbaOffers, isLbaConfigured, type LbaCriteria } from "./labonnealternance";
import { matchRegionName } from "./frenchRegions";

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
// appel (parametre range, deja au maximum documente) ; Adzuna plafonne
// results_per_page a 50 mais fetchAdzunaOffers pagine automatiquement sur
// plusieurs pages officielles au-dela de cette valeur ; La bonne alternance
// ne documente pas de parametre de pagination, la limite n'est ici qu'un
// decoupage cote client du nombre de resultats deja renvoyes par l'API.
const FRANCE_TRAVAIL_LIMIT = 150;
const ADZUNA_LIMIT = 100;
const LBA_LIMIT = 100;

// Adzuna et La bonne alternance filtrent tous deux par une localisation
// unique (coordonnees geocodees pour LBA, texte libre pour Adzuna) : sans
// ce garde-fou, seule la PREMIERE localisation de tes criteres serait
// jamais interrogee, les autres villes/regions configurees etant
// silencieusement ignorees. On interroge donc chaque ville separement (en
// parallele) et on fusionne les resultats - les doublons entre appels sont
// deja geres par la deduplication existante lors de l'insertion en base.
const MAX_LOCATIONS_PER_SOURCE = 5;

// Une region (ex: "Ile-de-France") n'est pas un lieu geocodable : on ne la
// passe pas a ces adaptateurs (LBA echouerait a la geocoder, Adzuna la
// traiterait comme un simple mot-cle peu fiable) - le matching local
// (frenchRegions.ts) se charge deja de couvrir toute la region a partir des
// offres remontees sans filtre de localisation.
export function cityLocations(locations: string[]): string[] {
  return locations.filter((loc) => !matchRegionName(loc));
}

async function fetchAdzunaForAllLocations(criteria: AdzunaCriteria, limit: number): Promise<ExternalOffer[]> {
  const cities = cityLocations(criteria.locations).slice(0, MAX_LOCATIONS_PER_SOURCE);
  if (cities.length <= 1) return fetchAdzunaOffers(criteria, limit);

  const perLocationLimit = Math.max(20, Math.ceil(limit / cities.length));
  const results = await Promise.all(
    cities.map((city) => fetchAdzunaOffers({ ...criteria, locations: [city] }, perLocationLimit))
  );
  return results.flat();
}

async function fetchLbaForAllLocations(criteria: LbaCriteria, limit: number): Promise<ExternalOffer[]> {
  const cities = cityLocations(criteria.locations).slice(0, MAX_LOCATIONS_PER_SOURCE);
  if (cities.length <= 1) return fetchLbaOffers(criteria, limit);

  const perLocationLimit = Math.max(20, Math.ceil(limit / cities.length));
  const results = await Promise.all(
    cities.map((city) => fetchLbaOffers({ ...criteria, locations: [city] }, perLocationLimit))
  );
  return results.flat();
}

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
      fetchAdzunaForAllLocations(criteria, ADZUNA_LIMIT)
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
      fetchLbaForAllLocations(criteria, LBA_LIMIT)
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
