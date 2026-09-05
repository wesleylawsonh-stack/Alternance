import { PDFDocument, StandardFonts, rgb, PDFFont, PDFImage } from "pdf-lib";

export type CvContent = {
  headline: string | null;
  summary: string | null;
  skills: string[];
  experiences: string[];
  education: string[];
  languages: string[];
};

export type CvContact = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
};

export type CvPhoto = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
};

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BRAND = rgb(0.145, 0.388, 0.921);
const BRAND_DARK = rgb(0.09, 0.22, 0.55);
const TEXT_DARK = rgb(0.08, 0.1, 0.16);
const TEXT_BODY = rgb(0.18, 0.2, 0.26);
const TEXT_MUTED = rgb(0.42, 0.46, 0.53);
const CHIP_BG = rgb(0.92, 0.94, 0.99);
const HEADER_BG = rgb(0.965, 0.972, 0.992);
const RULE = rgb(0.85, 0.88, 0.95);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Reconstitue une structure CvContent a partir du format texte "ACCROCHE /
 * COMPETENCES / EXPERIENCE / FORMATION / LANGUES" utilise par l'adaptation
 * de CV existante (src/lib/ai.ts). Permet de faire beneficier ce flux du
 * meme template soigne sans en changer le format de sortie.
 */
export function parseSectionedCvText(text: string): CvContent {
  const sectionRegex = /^(ACCROCHE|COMPETENCES|EXPERIENCE|FORMATION|LANGUES)\s*$/;
  const buffers: Record<string, string[]> = { ACCROCHE: [], COMPETENCES: [], EXPERIENCE: [], FORMATION: [], LANGUES: [] };
  let current: keyof typeof buffers | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(sectionRegex);
    if (match) {
      current = match[1] as keyof typeof buffers;
      continue;
    }
    if (line && current) buffers[current].push(line);
  }

  return {
    headline: buffers.ACCROCHE.join(" ") || null,
    summary: null,
    skills: buffers.COMPETENCES.join(" ")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    experiences: buffers.EXPERIENCE,
    education: buffers.FORMATION,
    languages: buffers.LANGUES,
  };
}

/**
 * Reconstitue une structure CvContent a partir des donnees de profil telles
 * qu'extraites a l'import du CV (headline, resume, competences, sections).
 * Sert de repli pour reafficher/re-generer le "CV original" en PDF quand le
 * fichier importe lui-meme n'a pas ete conserve (stockage Blob absent).
 */
export function cvContentFromProfile(profile: {
  headline: string | null;
  cvSkills: string[];
  cvSections: { summary: string | null; experiences: string[]; education: string[]; languages: string[] };
}): CvContent {
  return {
    headline: profile.headline,
    summary: profile.cvSections.summary,
    skills: profile.cvSkills,
    experiences: profile.cvSections.experiences,
    education: profile.cvSections.education,
    languages: profile.cvSections.languages,
  };
}

export async function renderCvPdf(content: CvContent, contact: CvContact, photo?: CvPhoto | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) newPage();
  };

  // --- En-tete (bande de couleur, nom, accroche, contact, photo) ---
  const contactParts = [contact.location, contact.phone, contact.email, contact.linkedin].filter(Boolean);
  const headlineLines = content.headline ? wrapText(content.headline, font, 11, CONTENT_WIDTH - 120) : [];
  const headerHeight = 58 + headlineLines.length * 14 + (contactParts.length ? 16 : 0);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerHeight, width: PAGE_WIDTH, height: headerHeight, color: HEADER_BG });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerHeight, width: 6, height: headerHeight, color: BRAND });

  let photoImage: PDFImage | null = null;
  if (photo) {
    try {
      photoImage = photo.contentType === "image/png" ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
    } catch (err) {
      console.error("Impossible d'integrer la photo au PDF:", err);
    }
  }

  const photoSize = 62;
  const textRightEdge = photoImage ? PAGE_WIDTH - MARGIN - photoSize - 16 : PAGE_WIDTH - MARGIN;

  if (photoImage) {
    page.drawImage(photoImage, {
      x: PAGE_WIDTH - MARGIN - photoSize,
      y: PAGE_HEIGHT - headerHeight + (headerHeight - photoSize) / 2,
      width: photoSize,
      height: photoSize,
    });
  }

  y = PAGE_HEIGHT - 40;
  page.drawText(contact.fullName || "Candidat", { x: MARGIN + 12, y, size: 20, font: boldFont, color: TEXT_DARK });
  y -= 22;

  for (const line of headlineLines) {
    page.drawText(line, { x: MARGIN + 12, y, size: 11, font, color: BRAND_DARK, maxWidth: textRightEdge - MARGIN - 12 });
    y -= 14;
  }

  if (contactParts.length) {
    const contactLine = contactParts.join("   •   ");
    page.drawText(contactLine, { x: MARGIN + 12, y, size: 9, font, color: TEXT_MUTED });
    y -= 16;
  }

  y = PAGE_HEIGHT - headerHeight - 22;

  const drawSectionHeader = (label: string) => {
    ensureSpace(26);
    page.drawRectangle({ x: MARGIN, y: y - 3, width: 3, height: 12, color: BRAND });
    page.drawText(label.toUpperCase(), { x: MARGIN + 10, y, size: 11.5, font: boldFont, color: BRAND_DARK });
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: RULE });
    y -= 14;
  };

  const drawParagraph = (text: string, size = 10.3, color = TEXT_BODY, gapAfter = 8) => {
    const lines = wrapText(text, font, size, CONTENT_WIDTH);
    for (const line of lines) {
      ensureSpace(14);
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= 13.5;
    }
    y -= gapAfter;
  };

  const drawBulletList = (items: string[]) => {
    for (const item of items) {
      const lines = wrapText(item, font, 10.2, CONTENT_WIDTH - 14);
      lines.forEach((line, i) => {
        ensureSpace(14);
        if (i === 0) page.drawText("•", { x: MARGIN, y, size: 10.2, font: boldFont, color: BRAND });
        page.drawText(line, { x: MARGIN + 14, y, size: 10.2, font, color: TEXT_BODY });
        y -= 13.5;
      });
      y -= 5;
    }
  };

  const drawSkillChips = (skills: string[]) => {
    let cursorX = MARGIN;
    const chipHeight = 18;
    const padX = 8;
    const gap = 6;
    ensureSpace(chipHeight + 4);

    for (const skill of skills) {
      const textWidth = boldFont.widthOfTextAtSize(skill, 9);
      const chipWidth = textWidth + padX * 2;
      if (cursorX + chipWidth > PAGE_WIDTH - MARGIN) {
        cursorX = MARGIN;
        y -= chipHeight + gap;
        ensureSpace(chipHeight + 4);
      }
      page.drawRectangle({ x: cursorX, y: y - chipHeight + 4, width: chipWidth, height: chipHeight, color: CHIP_BG });
      page.drawText(skill, { x: cursorX + padX, y: y - chipHeight + 8, size: 9, font: boldFont, color: BRAND_DARK });
      cursorX += chipWidth + gap;
    }
    y -= chipHeight + 10;
  };

  if (content.summary) {
    drawSectionHeader("Profil");
    drawParagraph(content.summary);
  }

  if (content.skills.length) {
    drawSectionHeader("Competences");
    drawSkillChips(content.skills);
  }

  if (content.experiences.length) {
    drawSectionHeader("Experience");
    drawBulletList(content.experiences);
  }

  if (content.education.length) {
    drawSectionHeader("Formation");
    drawBulletList(content.education);
  }

  if (content.languages.length) {
    drawSectionHeader("Langues");
    drawParagraph(content.languages.join(" · "));
  }

  return doc.save();
}
