import { describe, it, expect, vi } from "vitest";
import { computeContentOverlap, computeWeightedMatch, type MatchCriteria, type MatchOfferInfo } from "./matching";

// checkLocation() (interne a matching.ts) appelle des fonctions de geocode.ts
// qui font de vrais appels reseau : on les mocke pour des tests
// deterministes et rapides, sans dependre d'un service externe.
vi.mock("./geocode", () => ({
  distanceBetweenPlacesKm: vi.fn(async () => null),
  geocodeDetailed: vi.fn(async () => null),
  departmentCodeFromCitycode: (citycode: string | null) => {
    if (!citycode) return null;
    return citycode.startsWith("97") ? citycode.slice(0, 3) : citycode.slice(0, 2).toUpperCase();
  },
}));

import { distanceBetweenPlacesKm, geocodeDetailed } from "./geocode";

function baseCriteria(overrides: Partial<MatchCriteria> = {}): MatchCriteria {
  return {
    contractTypes: [],
    locations: [],
    radiusKm: null,
    remote: false,
    excludeKeywords: [],
    keywords: [],
    searchDescription: null,
    ...overrides,
  };
}

function baseOffer(overrides: Partial<MatchOfferInfo> = {}): MatchOfferInfo {
  return {
    contractType: null,
    location: null,
    description: "Recherche developpeur web junior, React et JavaScript.",
    ...overrides,
  };
}

describe("computeContentOverlap", () => {
  it("renvoie 0 si l'offre n'a pas de mots significatifs", () => {
    expect(computeContentOverlap("du texte de CV", "")).toBe(0);
  });

  it("detecte un fort recouvrement de vocabulaire", () => {
    const cv = "Developpeur web specialise en React et JavaScript, experience Node.js.";
    const offer = "Nous cherchons un developpeur React JavaScript pour rejoindre l'equipe.";
    expect(computeContentOverlap(cv, offer)).toBeGreaterThan(40);
  });

  it("ignore les mots vides frequents (stopwords)", () => {
    const cv = "avec pour dans sans";
    const offer = "avec pour dans sans developpeur";
    // Seul "developpeur" est un mot significatif de l'offre, absent du CV.
    expect(computeContentOverlap(cv, offer)).toBe(0);
  });
});

describe("computeWeightedMatch - type de contrat (regression bug 'Alternance')", () => {
  it("ne penalise pas 'Alternance' recherche contre une offre 'Contrat d'apprentissage'", async () => {
    const criteria = baseCriteria({ contractTypes: ["Alternance"] });
    const offer = baseOffer({ contractType: "Contrat d'apprentissage" });
    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaRespected).toContain("Type de contrat");
    expect(result.criteriaNotRespected).not.toContain("Type de contrat");
  });

  it("ne penalise pas 'Alternance' recherche contre une offre 'Contrat de professionnalisation'", async () => {
    const criteria = baseCriteria({ contractTypes: ["Alternance"] });
    const offer = baseOffer({ contractType: "Contrat de professionnalisation" });
    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaRespected).toContain("Type de contrat");
  });

  it("penalise 'Alternance' recherche contre une offre CDI", async () => {
    const criteria = baseCriteria({ contractTypes: ["Alternance"] });
    const offer = baseOffer({ contractType: "CDI" });
    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaNotRespected).toContain("Type de contrat");
  });

  it("n'applique aucun filtre de contrat si aucun type n'est recherche", async () => {
    const criteria = baseCriteria({ contractTypes: [] });
    const offer = baseOffer({ contractType: "CDI" });
    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaRespected).toContain("Type de contrat");
  });
});

describe("computeWeightedMatch - mots-cles", () => {
  it("penalise fortement une offre contenant un mot-cle exclu", async () => {
    const cv = "Developpeur React JavaScript, poste junior en alternance.";
    const criteria = baseCriteria({ excludeKeywords: ["senior"] });
    const withExcluded = baseOffer({ description: "Poste senior React JavaScript, 5 ans d'experience minimum." });
    const withoutExcluded = baseOffer({ description: "Poste junior React JavaScript, alternance bienvenue." });

    const resultExcluded = await computeWeightedMatch([], cv, "", withExcluded, criteria);
    const resultClean = await computeWeightedMatch([], cv, "", withoutExcluded, criteria);

    expect(resultExcluded.criteriaNotRespected).toContain("Mots-cles exclus");
    expect(resultExcluded.score).toBeLessThan(resultClean.score);
  });

  it("bonifie le score quand des mots-cles bonus sont presents dans l'offre", async () => {
    const criteria = baseCriteria({ keywords: ["React", "TypeScript"] });
    const offer = baseOffer({ description: "Recherche developpeur React et TypeScript, junior accepte." });
    const criteriaEmpty = baseCriteria();

    const withBonus = await computeWeightedMatch([], "", "", offer, criteria);
    const withoutBonus = await computeWeightedMatch([], "", "", offer, criteriaEmpty);

    expect(withBonus.score).toBeGreaterThanOrEqual(withoutBonus.score);
  });
});

describe("computeWeightedMatch - localisation par region", () => {
  it("accepte une offre dont le departement fait partie de la region recherchee", async () => {
    vi.mocked(geocodeDetailed).mockResolvedValueOnce({ lat: 48.8, lon: 2.3, citycode: "78646" }); // Versailles, dept 78
    const criteria = baseCriteria({ locations: ["Île-de-France"] });
    const offer = baseOffer({ location: "Versailles" });

    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaRespected).toContain("Localisation");
  });

  it("rejette une offre hors de la region recherchee", async () => {
    vi.mocked(geocodeDetailed).mockResolvedValueOnce({ lat: 43.3, lon: 5.4, citycode: "13055" }); // Marseille, dept 13
    const criteria = baseCriteria({ locations: ["Île-de-France"] });
    const offer = baseOffer({ location: "Marseille" });

    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaNotRespected).toContain("Localisation");
  });

  it("utilise le rayon pour une ville precise (comportement historique)", async () => {
    vi.mocked(distanceBetweenPlacesKm).mockResolvedValueOnce(15);
    const criteria = baseCriteria({ locations: ["Paris"], radiusKm: 30 });
    const offer = baseOffer({ location: "Boulogne-Billancourt" });

    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.criteriaRespected).toContain("Localisation");
  });
});

describe("computeWeightedMatch - critere obligatoire", () => {
  it("penalise fortement une offre qui ne correspond pas au critere obligatoire", async () => {
    const cv = "Developpeur React JavaScript junior en alternance.";
    const offerMet = baseOffer({ description: "Alternance developpeur React JavaScript.", mandatoryCriteriaMet: true });
    const offerNotMet = baseOffer({ description: "Alternance developpeur React JavaScript.", mandatoryCriteriaMet: false });

    const resultMet = await computeWeightedMatch([], cv, "", offerMet, baseCriteria());
    const resultNotMet = await computeWeightedMatch([], cv, "", offerNotMet, baseCriteria());

    expect(resultMet.criteriaRespected).toContain("Critere obligatoire");
    expect(resultNotMet.criteriaNotRespected).toContain("Critere obligatoire");
    expect(resultNotMet.score).toBeLessThan(resultMet.score);
    expect(resultNotMet.recommendation).toBe("IGNORER");
  });

  it("ne penalise pas quand le critere obligatoire n'a pas ete evalue (null/undefined)", async () => {
    const cv = "Developpeur React JavaScript, alternance.";
    const offer = baseOffer({ description: "Alternance React JavaScript.", mandatoryCriteriaMet: null });
    const offerNoField = baseOffer({ description: "Alternance React JavaScript." });

    const resultNull = await computeWeightedMatch([], cv, "", offer, baseCriteria());
    const resultUndefined = await computeWeightedMatch([], cv, "", offerNoField, baseCriteria());

    expect(resultNull.criteriaNotRespected).not.toContain("Critere obligatoire");
    expect(resultUndefined.criteriaNotRespected).not.toContain("Critere obligatoire");
    expect(resultNull.score).toBe(resultUndefined.score);
  });
});

describe("computeWeightedMatch - recommandation", () => {
  it("recommande POSTULER pour un excellent match sans obstacle", async () => {
    const cvSkills = ["react", "javascript", "typescript"];
    const cv = "Developpeur React JavaScript TypeScript avec 2 ans d'experience en alternance.";
    const offer = baseOffer({ description: "Alternance developpeur React JavaScript TypeScript." });
    const result = await computeWeightedMatch(cvSkills, cv, "", offer, baseCriteria());
    expect(result.recommendation).toBe("POSTULER");
  });

  it("recommande IGNORER pour une offre avec mot-cle exclu et aucune correspondance", async () => {
    const criteria = baseCriteria({ excludeKeywords: ["confidentiel"] });
    const offer = baseOffer({ description: "Poste confidentiel, sans rapport avec le profil." });
    const result = await computeWeightedMatch([], "", "", offer, criteria);
    expect(result.recommendation).toBe("IGNORER");
  });
});
