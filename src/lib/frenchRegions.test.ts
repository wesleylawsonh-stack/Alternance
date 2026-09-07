import { describe, it, expect } from "vitest";
import { matchRegionName, departmentsForRegion, searchRegions, FRENCH_REGIONS } from "./frenchRegions";

describe("matchRegionName", () => {
  it("reconnait le nom exact", () => {
    expect(matchRegionName("Île-de-France")).toBe("Île-de-France");
  });

  it("ignore accents, tirets et casse", () => {
    expect(matchRegionName("ile de france")).toBe("Île-de-France");
    expect(matchRegionName("ILE-DE-FRANCE")).toBe("Île-de-France");
    expect(matchRegionName("Ile De France")).toBe("Île-de-France");
  });

  it("renvoie null pour un nom de ville (pas une region)", () => {
    expect(matchRegionName("Paris")).toBeNull();
    expect(matchRegionName("Lyon")).toBeNull();
  });

  it("renvoie null pour une chaine vide", () => {
    expect(matchRegionName("")).toBeNull();
  });
});

describe("departmentsForRegion", () => {
  it("renvoie les bons departements pour l'Ile-de-France", () => {
    expect(departmentsForRegion("Ile-de-France")).toEqual(["75", "77", "78", "91", "92", "93", "94", "95"]);
  });

  it("renvoie null pour un texte qui n'est pas une region", () => {
    expect(departmentsForRegion("Marseille")).toBeNull();
  });

  it("chaque region declaree a au moins un departement", () => {
    for (const [name, depts] of Object.entries(FRENCH_REGIONS)) {
      expect(depts.length, `${name} devrait avoir au moins un departement`).toBeGreaterThan(0);
    }
  });
});

describe("searchRegions", () => {
  it("trouve une region par prefixe", () => {
    expect(searchRegions("bre")).toContain("Bretagne");
  });

  it("trouve une region par sous-chaine insensible aux accents", () => {
    expect(searchRegions("ile")).toContain("Île-de-France");
  });

  it("renvoie un tableau vide pour une requete vide", () => {
    expect(searchRegions("")).toEqual([]);
  });

  it("renvoie un tableau vide si rien ne correspond", () => {
    expect(searchRegions("xyzabc")).toEqual([]);
  });
});
