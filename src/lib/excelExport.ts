import ExcelJS from "exceljs";
import type { Offer } from "@prisma/client";

const STATUS_LABELS_FR: Record<string, string> = {
  NOT_APPLIED: "Non postule",
  APPLIED: "Candidature envoyee",
  INTERVIEW: "Entretien",
  OFFER: "Offre recue",
  REJECTED: "Refuse",
};

export async function buildOffersWorkbook(offers: Offer[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MonAlternance";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Candidatures", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Entreprise", key: "company", width: 26 },
    { header: "Poste", key: "title", width: 34 },
    { header: "Statut", key: "status", width: 20 },
    { header: "Score (%)", key: "score", width: 11 },
    { header: "Lieu", key: "location", width: 18 },
    { header: "Type de contrat", key: "contractType", width: 16 },
    { header: "Lien de l'offre", key: "url", width: 40 },
    { header: "Commentaires", key: "comments", width: 50 },
    { header: "Date d'ajout", key: "createdAt", width: 14 },
    { header: "Derniere mise a jour", key: "updatedAt", width: 18 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF2563EB" },
  };
  sheet.getRow(1).alignment = { vertical: "middle" };

  const STATUS_COLORS: Record<string, string> = {
    NOT_APPLIED: "FFF1F5F9",
    APPLIED: "FFDBEAFE",
    INTERVIEW: "FFEDE9FE",
    OFFER: "FFDCFCE7",
    REJECTED: "FFFEE2E2",
  };

  for (const offer of offers) {
    const row = sheet.addRow({
      company: offer.company ?? "",
      title: offer.title,
      status: STATUS_LABELS_FR[offer.applicationStatus] ?? offer.applicationStatus,
      score: offer.matchScore !== null && offer.matchScore !== undefined ? Math.round(offer.matchScore) : "",
      location: offer.location ?? "",
      contractType: offer.contractType ?? "",
      url: offer.url ?? "",
      comments: offer.comments ?? "",
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    });

    const statusCell = row.getCell("status");
    const color = STATUS_COLORS[offer.applicationStatus];
    if (color) {
      statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    }

    const urlCell = row.getCell("url");
    if (offer.url) {
      urlCell.value = { text: offer.url, hyperlink: offer.url };
      urlCell.font = { color: { argb: "FF2563EB" }, underline: true };
    }

    row.getCell("createdAt").numFmt = "dd/mm/yyyy";
    row.getCell("updatedAt").numFmt = "dd/mm/yyyy hh:mm";
    row.getCell("comments").alignment = { wrapText: true, vertical: "top" };
  }

  sheet.autoFilter = { from: "A1", to: "J1" };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
