// Regions administratives francaises (issues de la reforme territoriale de
// 2016, plus les regions/collectivites d'outre-mer) -> codes departement
// qu'elles regroupent. Sert a faire correspondre une recherche par region
// (ex: "Ile-de-France") a toute offre situee dans un departement de cette
// region, plutot que de se limiter a une seule ville + un rayon.
export const FRENCH_REGIONS: Record<string, string[]> = {
  "Île-de-France": ["75", "77", "78", "91", "92", "93", "94", "95"],
  "Auvergne-Rhône-Alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "Bourgogne-Franche-Comté": ["21", "25", "39", "58", "70", "71", "89", "90"],
  Bretagne: ["22", "29", "35", "56"],
  "Centre-Val de Loire": ["18", "28", "36", "37", "41", "45"],
  Corse: ["2A", "2B"],
  "Grand Est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "Hauts-de-France": ["02", "59", "60", "62", "80"],
  Normandie: ["14", "27", "50", "61", "76"],
  "Nouvelle-Aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  Occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "Pays de la Loire": ["44", "49", "53", "72", "85"],
  "Provence-Alpes-Côte d'Azur": ["04", "05", "06", "13", "83", "84"],
  Guadeloupe: ["971"],
  Martinique: ["972"],
  Guyane: ["973"],
  "La Réunion": ["974"],
  Mayotte: ["976"],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[-\s]+/g, " ")
    .trim();
}

const NORMALIZED_REGIONS = new Map(Object.keys(FRENCH_REGIONS).map((name) => [normalize(name), name]));

/** Nom canonique de la region si `text` correspond a une region connue (insensible aux accents/tirets/casse), sinon null. */
export function matchRegionName(text: string): string | null {
  return NORMALIZED_REGIONS.get(normalize(text)) ?? null;
}

/** Codes departement de la region si `regionName` en designe une, sinon null. */
export function departmentsForRegion(regionName: string): string[] | null {
  const exact = matchRegionName(regionName);
  return exact ? FRENCH_REGIONS[exact] : null;
}

/** Noms de regions (canoniques) dont le nom contient `query`, pour l'autocompletion. */
export function searchRegions(query: string): string[] {
  const q = normalize(query);
  if (!q) return [];
  return Object.keys(FRENCH_REGIONS).filter((name) => normalize(name).includes(q));
}
