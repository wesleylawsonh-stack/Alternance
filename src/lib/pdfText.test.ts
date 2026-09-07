import { describe, it, expect } from "vitest";
import { reconstructPageText, type ExtractedTextItem } from "./pdfText";

function item(str: string, x: number, y: number, width: number, fontSize = 11): ExtractedTextItem {
  return { str, x, y, width, fontSize };
}

describe("reconstructPageText", () => {
  it("insere un saut de ligne quand la coordonnee Y change, meme sans hasEOL fiable", () => {
    // Reproduit le bug observe en production : deux lignes distinctes d'un
    // CV genere par positionnement absolu (Canva, Word...) que pdf.js ne
    // marque pas toujours correctement comme fin de ligne, collant alors
    // les deux lignes ensemble ("...AVRIL 2025Pilote le suivi...").
    const items = [item("...AVRIL - JUIN 2025", 50, 800, 120), item("Pilote le suivi des devis", 50, 780, 150)];
    expect(reconstructPageText(items)).toBe("...AVRIL - JUIN 2025\nPilote le suivi des devis");
  });

  it("insere un espace entre deux items de la meme ligne separes par un ecart visible", () => {
    const items = [item("conseil personnalisé.", 50, 800, 100), item("Contribué à l'atteinte", 155, 800, 120)];
    expect(reconstructPageText(items)).toBe("conseil personnalisé. Contribué à l'atteinte");
  });

  it("n'insere rien entre deux items de la meme ligne sans ecart (mot coupe par le crenage)", () => {
    const items = [item("Techn", 50, 800, 30), item("iques", 80, 800, 30)];
    expect(reconstructPageText(items)).toBe("Techniques");
  });

  it("gere une page normale multi-lignes sans introduire de saut superflu", () => {
    const items = [item("Ligne 1", 50, 800, 40), item("Ligne 2", 50, 780, 40), item("Ligne 3", 50, 760, 40)];
    expect(reconstructPageText(items)).toBe("Ligne 1\nLigne 2\nLigne 3");
  });
});
