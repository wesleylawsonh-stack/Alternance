// Geocodage d'adresses/villes francaises via l'API Adresse (gouv.fr) :
// gratuite, sans cle, limitee a la France (coherent avec un usage
// alternance/emploi en France). Utilisee pour comparer la localisation
// d'une offre au rayon de recherche defini dans les criteres.

type LatLon = { lat: number; lon: number };

const cache = new Map<string, LatLon | null>();

function normalizeQuery(text: string): string {
  return text.trim().toLowerCase();
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocode un nom de ville/adresse francaise. Retourne null si introuvable,
 * si la requete echoue ou si elle prend plus de 3 secondes (on ne bloque
 * jamais le calcul de matching pour un probleme reseau).
 */
export async function geocode(query: string): Promise<LatLon | null> {
  const key = normalizeQuery(query);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=1`;
  const res = await fetchWithTimeout(url, 3000);
  if (!res || !res.ok) {
    cache.set(key, null);
    return null;
  }

  try {
    const json = (await res.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords) {
      cache.set(key, null);
      return null;
    }
    const result = { lon: coords[0], lat: coords[1] };
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

/** Distance a vol d'oiseau en kilometres (formule de Haversine). */
export function haversineDistanceKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distance entre deux noms de lieux francais, ou null si l'un des deux
 * n'a pas pu etre geocode (jamais d'erreur bloquante).
 */
export async function distanceBetweenPlacesKm(placeA: string, placeB: string): Promise<number | null> {
  const [a, b] = await Promise.all([geocode(placeA), geocode(placeB)]);
  if (!a || !b) return null;
  return haversineDistanceKm(a, b);
}
