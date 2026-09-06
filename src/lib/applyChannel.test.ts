import { describe, it, expect } from "vitest";
import { detectApplyChannel } from "./applyChannel";

describe("detectApplyChannel", () => {
  it("detecte un canal EMAIL a partir d'un lien mailto: explicite", () => {
    const channel = detectApplyChannel({ url: "mailto:rh@acme.fr", description: "Poste de developpeur." });
    expect(channel).toEqual({ type: "EMAIL", target: "rh@acme.fr" });
  });

  it("ignore les parametres d'un lien mailto: (sujet, corps...)", () => {
    const channel = detectApplyChannel({ url: "mailto:rh@acme.fr?subject=Candidature", description: "" });
    expect(channel).toEqual({ type: "EMAIL", target: "rh@acme.fr" });
  });

  it("detecte une adresse email dans la description proche d'un mot-cle de candidature", () => {
    const channel = detectApplyChannel({
      url: "https://acme.fr/offre-123",
      description: "Merci d'envoyer votre CV et lettre de motivation a recrutement@acme.fr avant le 30 juin.",
    });
    expect(channel).toEqual({ type: "EMAIL", target: "recrutement@acme.fr" });
  });

  it("ignore une adresse email sans contexte de candidature a proximite", () => {
    const description =
      "Acme est une entreprise leader sur son marche depuis 20 ans, basee a Lyon. ".repeat(5) +
      "info@acme.fr " +
      "Nous developpons des logiciels pour la sante. ".repeat(5);
    const channel = detectApplyChannel({ url: "https://acme.fr/offre-123", description });
    expect(channel).toEqual({ type: "WEB", target: "https://acme.fr/offre-123" });
  });

  it("retombe sur le canal WEB si aucune adresse email n'est detectee", () => {
    const channel = detectApplyChannel({ url: "https://acme.fr/offre-123", description: "Poste de developpeur." });
    expect(channel).toEqual({ type: "WEB", target: "https://acme.fr/offre-123" });
  });

  it("renvoie null si ni email ni URL web exploitable", () => {
    expect(detectApplyChannel({ url: null, description: "Poste de developpeur." })).toBeNull();
    expect(detectApplyChannel({ url: "", description: "Poste de developpeur." })).toBeNull();
  });
});
