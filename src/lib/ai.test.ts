import { describe, it, expect } from "vitest";
import { checkMandatoryCriteriaWithHeuristic } from "./ai";

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
