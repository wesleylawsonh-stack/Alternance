import { PDFDocument, StandardFonts, rgb, PDFFont } from "pdf-lib";

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;

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

export async function generateCvPdf(params: {
  title: string;
  contactLine: string;
  bodyText: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < PAGE_MARGIN) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - PAGE_MARGIN;
    }
  };

  const drawTitle = (text: string) => {
    newPageIfNeeded(24);
    page.drawText(text, { x: PAGE_MARGIN, y, size: 18, font: boldFont, color: rgb(0.12, 0.16, 0.4) });
    y -= 24;
  };

  const drawSubtitle = (text: string) => {
    const lines = wrapText(text, font, 10, maxWidth);
    for (const line of lines) {
      newPageIfNeeded(14);
      page.drawText(line, { x: PAGE_MARGIN, y, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
      y -= 14;
    }
  };

  const drawSectionHeader = (text: string) => {
    newPageIfNeeded(22);
    y -= 6;
    page.drawText(text, { x: PAGE_MARGIN, y, size: 12, font: boldFont, color: rgb(0.15, 0.3, 0.75) });
    y -= 4;
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
      thickness: 0.75,
      color: rgb(0.8, 0.85, 0.95),
    });
    y -= 14;
  };

  const drawParagraph = (text: string) => {
    const lines = wrapText(text, font, 10.5, maxWidth);
    for (const line of lines) {
      newPageIfNeeded(14);
      page.drawText(line, { x: PAGE_MARGIN, y, size: 10.5, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 14;
    }
    y -= 4;
  };

  drawTitle(params.title);
  drawSubtitle(params.contactLine);
  y -= 6;

  const sectionRegex = /^(ACCROCHE|COMPETENCES|EXPERIENCE|FORMATION|LANGUES)\s*$/;
  const rawLines = params.bodyText.split(/\r?\n/);
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length) {
      drawParagraph(buffer.join(" "));
      buffer = [];
    }
  };

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (sectionRegex.test(trimmed)) {
      flush();
      drawSectionHeader(trimmed);
    } else if (trimmed === "") {
      flush();
    } else {
      buffer.push(trimmed);
    }
  }
  flush();

  return doc.save();
}
