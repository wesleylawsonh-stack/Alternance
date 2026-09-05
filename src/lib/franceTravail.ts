// Adaptateur pour l'API "Offres d'emploi v2" de France Travail (ex Pole Emploi).
// Documentation : https://francetravail.io/produits-partenaires/catalogue/offres-emploi
// Necessite la creation d'une application sur francetravail.io puis de renseigner
// FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET dans .env.
// Tant que ces variables sont absentes, l'adaptateur est simplement desactive.

export type FranceTravailCriteria = {
  jobTitles: string[];
  locations: string[];
  contractTypes: string[]; // ex: ["Alternance", "Stage", "CDI"]
};

export type ExternalOffer = {
  externalId: string;
  title: string;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  url: string | null;
  description: string;
  contractType: string | null;
  postedAt: string | null;
};

const TOKEN_URL =
  "https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.pole-emploi.io/partenaire/offresdemploi/v2/offres/search";

const CONTRACT_TYPE_MAP: Record<string, string> = {
  alternance: "E2", // Contrat d'apprentissage / de professionnalisation (regroupes cote UI)
  apprentissage: "E2",
  stage: "FS",
  cdi: "CDI",
  cdd: "CDD",
  interim: "MIS",
};

export function isFranceTravailConfigured(): boolean {
  return Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET);
}

// Une erreur reseau (DNS, timeout, connexion refusee/reinitialisee) fait
// echouer fetch() lui-meme avec un message generique ("fetch failed") qui ne
// dit pas grand-chose : le detail utile est dans err.cause. On l'inclut pour
// que les erreurs remontees a l'utilisateur soient exploitables.
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
    throw new Error(`Requete reseau vers France Travail echouee : ${describeNetworkError(err)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID!;
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET!;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "api_offresdemploiv2 o2dsoffre",
  });

  const res = await fetchWithTimeout(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Authentification France Travail echouee (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function fetchFranceTravailOffers(
  criteria: FranceTravailCriteria,
  limit = 20
): Promise<ExternalOffer[]> {
  if (!isFranceTravailConfigured()) {
    throw new Error(
      "L'integration France Travail n'est pas configuree (FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET manquants)."
    );
  }

  const token = await getAccessToken();

  const params = new URLSearchParams();
  if (criteria.jobTitles.length) params.set("motsCles", criteria.jobTitles.join(" "));
  if (criteria.locations.length) params.set("commune", criteria.locations[0]);

  const contractCodes = criteria.contractTypes
    .map((c) => CONTRACT_TYPE_MAP[c.toLowerCase().trim()])
    .filter(Boolean);
  if (contractCodes.length) params.set("typeContrat", contractCodes.join(","));

  params.set("range", `0-${Math.max(0, limit - 1)}`);
  params.set("sort", "1"); // tri par date de creation decroissante

  const res = await fetchWithTimeout(`${SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 206) {
    const text = await res.text().catch(() => "");
    throw new Error(`Recherche d'offres France Travail echouee (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    resultats?: Array<{
      id: string;
      intitule: string;
      entreprise?: { nom?: string; logo?: string };
      lieuTravail?: { libelle?: string };
      description?: string;
      typeContratLibelle?: string;
      dateCreation?: string;
      origineOffre?: { urlOrigine?: string };
    }>;
  };

  return (json.resultats ?? []).map((o) => ({
    externalId: `france_travail:${o.id}`,
    title: o.intitule,
    company: o.entreprise?.nom ?? null,
    companyLogoUrl: o.entreprise?.logo ?? null,
    location: o.lieuTravail?.libelle ?? null,
    url: o.origineOffre?.urlOrigine ?? null,
    description: o.description ?? "",
    contractType: o.typeContratLibelle ?? null,
    postedAt: o.dateCreation ?? null,
  }));
}
