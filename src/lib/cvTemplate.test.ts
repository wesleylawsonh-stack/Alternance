import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { renderCvPdf, sanitizeTextForPdf, type CvContent, type CvContact } from "./cvTemplate";

async function embedHelvetica() {
  const doc = await PDFDocument.create();
  return doc.embedFont(StandardFonts.Helvetica);
}

describe("sanitizeTextForPdf", () => {
  it("laisse intact un texte francais standard", async () => {
    const font = await embedHelvetica();
    expect(sanitizeTextForPdf("Développeur full-stack, à l'aise en anglais.", font)).toBe(
      "Développeur full-stack, à l'aise en anglais."
    );
  });

  it("normalise les guillemets courbes et tirets longs en equivalents ASCII", async () => {
    const font = await embedHelvetica();
    expect(sanitizeTextForPdf("Texte “piégé” — vraiment…", font)).toBe('Texte "piégé" - vraiment...');
  });

  it("retire silencieusement les caracteres non encodables (emoji, ecritures non latines)", async () => {
    const font = await embedHelvetica();
    const sanitized = sanitizeTextForPdf("Développeur 🚀 full-stack (中文, العربية)", font);
    expect(sanitized).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(sanitized).not.toMatch(/[一-鿿]/);
    expect(sanitized).toContain("Développeur");
    expect(sanitized).toContain("full-stack");
  });
});

describe("renderCvPdf (garde-fou anti-crash sur caracteres non encodables)", () => {
  it("ne plante jamais, meme avec un contenu charge en emoji/ecritures non latines", async () => {
    const content: CvContent = {
      headline: "Développeur 🚀 full-stack — offre internationale ✨ (中文测试, العربية)",
      summary: "Résumé avec des caractères “piégés” 😀 et du texte non-latin (日本語).",
      skills: ["React ⚛️", "Café ☕"],
      experiences: ["Stage chez Acme™ — mission 🌍 internationale."],
      education: ["BUT Informatique"],
      languages: ["Français", "English 🇬🇧"],
    };
    const contact: CvContact = {
      fullName: "Léa Dupont",
      email: "lea@example.fr",
      phone: "06 12 34 56 78",
      location: "Lyon",
      linkedin: "linkedin.com/in/leadupont",
    };

    const pdfBytes = await renderCvPdf(content, contact, null);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });
});
