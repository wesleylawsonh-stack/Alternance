import { prisma } from "./db";
import { fetchRecentGmailMessages, getAuthorizedGmailClient } from "./gmail";
import { classifyEmailForOffer, matchOfferForEmail } from "./emailMatcher";

const STATUS_LABELS_FR: Record<string, string> = {
  APPLIED: "Candidature envoyee",
  INTERVIEW: "Entretien",
  OFFER: "Offre recue",
  REJECTED: "Refuse",
};

export type GmailSyncResult = {
  ranAt: Date;
  scanned: number;
  matched: number;
  updated: number;
};

export async function runGmailSync(): Promise<GmailSyncResult> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: "singleton" } });
  if (!account) {
    throw new Error("Aucun compte Gmail connecte.");
  }

  const client = await getAuthorizedGmailClient();

  const trackedOffers = await prisma.offer.findMany({
    where: { applicationStatus: { in: ["APPLIED", "INTERVIEW"] } },
  });

  const since = account.lastSyncAt
    ? new Date(account.lastSyncAt.getTime() - 24 * 60 * 60 * 1000) // marge de 24h par securite
    : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // premiere synchro : 60 derniers jours

  const recentProcessed = await prisma.processedEmail.findMany({
    where: { processedAt: { gte: since } },
    select: { messageId: true },
  });
  const excludeIds = new Set(recentProcessed.map((p) => p.messageId));

  let messages;
  try {
    messages = await fetchRecentGmailMessages(client, since, excludeIds);
  } catch (err) {
    await prisma.gmailAccount.update({
      where: { id: "singleton" },
      data: { lastSyncError: err instanceof Error ? err.message : "Erreur de synchronisation Gmail." },
    });
    throw err;
  }

  let matched = 0;
  let updated = 0;

  for (const message of messages) {
    const offer = matchOfferForEmail(trackedOffers, message);

    if (!offer) {
      await prisma.processedEmail.upsert({
        where: { messageId: message.id },
        create: { messageId: message.id, subject: message.subject, snippet: message.snippet },
        update: {},
      });
      continue;
    }

    matched++;
    const status = await classifyEmailForOffer(offer, message);

    await prisma.processedEmail.upsert({
      where: { messageId: message.id },
      create: {
        messageId: message.id,
        offerId: offer.id,
        matchedCompany: offer.company,
        detectedStatus: status,
        subject: message.subject,
        snippet: message.snippet,
      },
      update: { offerId: offer.id, matchedCompany: offer.company, detectedStatus: status },
    });

    if (status && status !== "APPLIED" && status !== offer.applicationStatus) {
      const dateLabel = message.internalDate.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const logLine = `[${dateLabel}] Statut mis a jour automatiquement en "${STATUS_LABELS_FR[status]}" suite a un email de ${message.from} — objet : "${message.subject}".`;
      const newComments = offer.comments ? `${offer.comments}\n${logLine}` : logLine;

      await prisma.offer.update({
        where: { id: offer.id },
        data: { applicationStatus: status, comments: newComments },
      });
      updated++;

      // Evite qu'une offre deja mise a jour dans cette synchro soit re-abaissee
      // par un autre email plus ancien traite ensuite.
      offer.applicationStatus = status;
      offer.comments = newComments;
    }
  }

  const ranAt = new Date();
  await prisma.gmailAccount.update({
    where: { id: "singleton" },
    data: { lastSyncAt: ranAt, lastSyncError: null },
  });

  return { ranAt, scanned: messages.length, matched, updated };
}
