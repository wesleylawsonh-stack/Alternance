import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFFont,
  PDFImage,
  PDFPage,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  appendBezierCurve,
  clip,
  endPath,
} from "pdf-lib";

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

/**
 * Recupere les octets de la photo de profil (Vercel Blob) pour l'integrer
 * au PDF genere. Ne fait jamais echouer l'appelant : une photo absente,
 * inaccessible, ou dans un format que pdf-lib ne sait pas integrer
 * (seuls JPEG/PNG sont supportes) donne simplement un CV sans photo
 * plutot qu'une erreur.
 */
export async function fetchProfilePhoto(photoUrl: string | null | undefined): Promise<CvPhoto | null> {
  if (!photoUrl) return null;
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type");
    if (contentType !== "image/png" && contentType !== "image/jpeg") return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, contentType };
  } catch (err) {
    console.error("Impossible de recuperer la photo de profil pour le PDF:", err);
    return null;
  }
}

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

/**
 * Dessine une image "en couvrant" (crop, jamais d'etirement) un cercle de
 * diametre donne, via un chemin de decoupe (clip) en cercle construit a la
 * bezier. pdf-lib n'offre pas de decoupe circulaire d'image prete a
 * l'emploi : c'est le recours bas niveau documente pour ce cas (moveTo +
 * 4 courbes de bezier approximant un cercle, clip, puis dessin de l'image
 * a l'interieur de la region decoupee).
 */
function drawCircularImage(page: PDFPage, image: PDFImage, opts: { x: number; y: number; diameter: number }) {
  const { x, y, diameter } = opts;
  const r = diameter / 2;
  const cx = x + r;
  const cy = y + r;
  const k = r * 0.5523; // constante d'approximation d'un cercle par 4 courbes de Bezier

  page.pushOperators(
    pushGraphicsState(),
    moveTo(cx + r, cy),
    appendBezierCurve(cx + r, cy + k, cx + k, cy + r, cx, cy + r),
    appendBezierCurve(cx - k, cy + r, cx - r, cy + k, cx - r, cy),
    appendBezierCurve(cx - r, cy - k, cx - k, cy - r, cx, cy - r),
    appendBezierCurve(cx + k, cy - r, cx + r, cy - k, cx + r, cy),
    clip(),
    endPath()
  );

  const imageAspect = image.width / image.height;
  let drawWidth = diameter;
  let drawHeight = diameter;
  let drawX = x;
  let drawY = y;
  if (imageAspect > 1) {
    drawWidth = diameter * imageAspect;
    drawX = x - (drawWidth - diameter) / 2;
  } else if (imageAspect < 1) {
    drawHeight = diameter / imageAspect;
    drawY = y - (drawHeight - diameter) / 2;
  }
  page.drawImage(image, { x: drawX, y: drawY, width: drawWidth, height: drawHeight });

  page.pushOperators(popGraphicsState());
}

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

  // --- En-tete (bande de couleur, photo circulaire, nom, accroche, contact) ---
  let photoImage: PDFImage | null = null;
  if (photo) {
    try {
      photoImage = photo.contentType === "image/png" ? await doc.embedPng(photo.bytes) : await doc.embedJpg(photo.bytes);
    } catch (err) {
      console.error("Impossible d'integrer la photo au PDF:", err);
    }
  }

  const photoSize = photoImage ? 76 : 0;
  const textLeftEdge = photoImage ? MARGIN + 20 + photoSize + 18 : MARGIN + 12;
  const textMaxWidth = PAGE_WIDTH - MARGIN - textLeftEdge;

  const contactParts = [contact.location, contact.phone, contact.email, contact.linkedin].filter(Boolean);
  const headlineLines = content.headline ? wrapText(content.headline, font, 11.5, textMaxWidth) : [];
  const headerContentHeight = 26 + headlineLines.length * 15 + (contactParts.length ? 16 : 0);
  const headerHeight = Math.max(photoSize + 34, headerContentHeight + 34);

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerHeight, width: PAGE_WIDTH, height: headerHeight, color: HEADER_BG });
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - headerHeight - 3, width: PAGE_WIDTH, height: 3, color: BRAND });

  if (photoImage) {
    const photoX = MARGIN + 20;
    const photoY = PAGE_HEIGHT - headerHeight + (headerHeight - photoSize) / 2;
    drawCircularImage(page, photoImage, { x: photoX, y: photoY, diameter: photoSize });
    page.drawCircle({
      x: photoX + photoSize / 2,
      y: photoY + photoSize / 2,
      size: photoSize / 2 + 1.5,
      borderColor: BRAND,
      borderWidth: 2,
    });
  }

  y = PAGE_HEIGHT - (headerHeight - headerContentHeight) / 2 - 16;
  page.drawText(contact.fullName || "Candidat", { x: textLeftEdge, y, size: 21, font: boldFont, color: TEXT_DARK });
  y -= 22;

  for (const line of headlineLines) {
    page.drawText(line, { x: textLeftEdge, y, size: 11.5, font, color: BRAND_DARK, maxWidth: textMaxWidth });
    y -= 15;
  }

  if (contactParts.length) {
    const contactLine = contactParts.join("   •   ");
    page.drawText(contactLine, { x: textLeftEdge, y, size: 9, font, color: TEXT_MUTED });
    y -= 16;
  }

  y = PAGE_HEIGHT - headerHeight - 24;

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
