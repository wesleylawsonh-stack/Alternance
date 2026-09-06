import { describe, it, expect } from "vitest";
import { departmentCodeFromCitycode, haversineDistanceKm } from "./geocode";

describe("departmentCodeFromCitycode", () => {
  it("renvoie null si aucun code fourni", () => {
    expect(departmentCodeFromCitycode(null)).toBeNull();
  });

  it("extrait les 2 premiers chiffres pour la metropole", () => {
    expect(departmentCodeFromCitycode("75056")).toBe("75"); // Paris
    expect(departmentCodeFromCitycode("69123")).toBe("69"); // Lyon
  });

  it("gere la Corse (2A/2B)", () => {
    expect(departmentCodeFromCitycode("2A004")).toBe("2A");
    expect(departmentCodeFromCitycode("2b033")).toBe("2B");
  });

  it("extrait les 3 premiers chiffres pour l'outre-mer (97x)", () => {
    expect(departmentCodeFromCitycode("97105")).toBe("971"); // Guadeloupe
    expect(departmentCodeFromCitycode("97411")).toBe("974"); // La Reunion
  });
});

describe("haversineDistanceKm", () => {
  it("renvoie 0 pour deux points identiques", () => {
    expect(haversineDistanceKm({ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.35 })).toBeCloseTo(0, 5);
  });

  it("calcule une distance realiste Paris <-> Lyon (~390km a vol d'oiseau)", () => {
    const paris = { lat: 48.8566, lon: 2.3522 };
    const lyon = { lat: 45.764, lon: 4.8357 };
    const distance = haversineDistanceKm(paris, lyon);
    expect(distance).toBeGreaterThan(380);
    expect(distance).toBeLessThan(400);
  });
});
