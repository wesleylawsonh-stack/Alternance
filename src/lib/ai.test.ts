import { describe, it, expect } from "vitest";
import { checkMandatoryCriteriaWithHeuristic, isVerbatimExtract, normalizeWhitespace } from "./ai";

describe("checkMandatoryCriteriaWithHeuristic", () => {
  it("renvoie true si aucun mot significatif dans le critere (rien a verifier)", () => {
    expect(checkMandatoryCriteriaWithHeuristic("", { title: "Dev", description: "React" })).toBe(true);
  });

  it("renvoie true si un mot du critere apparait dans l'offre", () => {
    const met = checkMandatoryCriteriaWithHeuristic("dimension internationale", {
      title: "Developpeur",
      description: "Poste au sein d'une equipe internationale, clients basés a Londres.",
    });
    expect(met).toBe(true);
  });

  it("renvoie false si aucun mot du critere n'apparait dans l'offre", () => {
    const met = checkMandatoryCriteriaWithHeuristic("dimension internationale", {
      title: "Developpeur",
      description: "Poste au sein d'une PME locale, clients francais uniquement.",
    });
    expect(met).toBe(false);
  });
});

describe("isVerbatimExtract (garde-fou anti-fabrication du decoupage IA du CV)", () => {
  it("accepte un extrait present tel quel dans la source", () => {
    const source = normalizeWhitespace("Developpeur full-stack chez Acme, de 2022 a 2024.");
    expect(isVerbatimExtract("Developpeur full-stack chez Acme, de 2022 a 2024.", source)).toBe(true);
  });

  it("accepte un extrait dont les sauts de ligne PDF ont ete rejoints", () => {
    const source = normalizeWhitespace("Developpeur full-stack\nchez Acme,\nde 2022 a 2024.");
    expect(isVerbatimExtract("Developpeur full-stack chez Acme, de 2022 a 2024.", source)).toBe(true);
  });

  it("rejette un extrait reformule ou invente, absent de la source", () => {
    const source = normalizeWhitespace("Developpeur full-stack chez Acme, de 2022 a 2024.");
    expect(isVerbatimExtract("Lead developpeur senior chez Acme depuis 2020.", source)).toBe(false);
  });

  it("rejette une chaine vide", () => {
    const source = normalizeWhitespace("Developpeur full-stack chez Acme.");
    expect(isVerbatimExtract("   ", source)).toBe(false);
  });
});
