import { describe, it, expect } from "vitest";
import { cityLocations } from "./offerSources";

describe("cityLocations", () => {
  it("garde les villes et retire les noms de region (non geocodables)", () => {
    expect(cityLocations(["Paris", "Ile-de-France", "Lyon", "Bretagne"])).toEqual(["Paris", "Lyon"]);
  });

  it("renvoie une liste vide si toutes les entrees sont des regions", () => {
    expect(cityLocations(["Ile-de-France", "Occitanie"])).toEqual([]);
  });

  it("renvoie toutes les entrees si aucune n'est une region", () => {
    expect(cityLocations(["Paris", "Lyon", "Marseille"])).toEqual(["Paris", "Lyon", "Marseille"]);
  });

  it("renvoie une liste vide pour une entree vide", () => {
    expect(cityLocations([])).toEqual([]);
  });
});
