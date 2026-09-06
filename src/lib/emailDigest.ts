// Digest email des nouvelles offres a fort potentiel, envoye via Gmail
// (necessite un compte connecte avec le scope gmail.send - voir gmail.ts).
// N'echoue jamais bruyamment : une erreur d'envoi est journalisee mais ne
// doit jamais faire echouer la recuperation d'offres elle-meme.

import type { Offer } from "@prisma/client";
import { getAuthorizedGmailClient, sendGmailMessage } from "./gmail";
import { prisma } from "./db";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendOfferDigest(offers: Offer[], baseUrl: string): Promise<void> {
  if (offers.length === 0) return;

  const account = await prisma.gmailAccount.findUnique({ where: { id: "singleton" } });
  if (!account?.email) return;

  try {
    const client = await getAuthorizedGmailClient();
    if (!client) return;

    const rows = offers
      .map((o) => {
        const title = escapeHtml(o.title);
        const meta = [o.company, o.location]
          .filter((v): v is string => Boolean(v))
          .map(escapeHtml)
          .join(" · ");
        const score = o.matchScore !== null ? `${Math.round(o.matchScore)}%` : "--";
        return `<tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;">
            <a href="${baseUrl}/offers/${o.id}" style="color:#2563eb;text-decoration:none;font-weight:600;">${title}</a><br/>
            <span style="color:#64748b;font-size:13px;">${meta || "&mdash;"}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#16a34a;white-space:nowrap;">${score}</td>
        </tr>`;
      })
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1d4ed8;margin-bottom:4px;">${offers.length} nouvelle${offers.length > 1 ? "s" : ""} offre${offers.length > 1 ? "s" : ""} a fort potentiel</h2>
        <p style="color:#475569;">Voici les offres recuperees aujourd'hui qui correspondent bien a ton profil et tes criteres.</p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <p style="margin-top:24px;"><a href="${baseUrl}/offers" style="color:#2563eb;">Voir toutes les offres sur MonAlternance →</a></p>
      </div>
    `;

    await sendGmailMessage(client, {
      to: account.email,
      subject: `${offers.length} nouvelle${offers.length > 1 ? "s" : ""} offre${offers.length > 1 ? "s" : ""} d'alternance a regarder`,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Envoi du digest email echoue:", err);
    // Remonte visible sur la page Integrations (meme champ que les erreurs
    // de synchronisation Gmail) plutot que de rester silencieux : le cas le
    // plus probable est un compte connecte avant l'ajout du scope
    // gmail.send, qu'il faut alors reconnecter.
    await prisma.gmailAccount
      .update({ where: { id: "singleton" }, data: { lastSyncError: `Digest email echoue : ${message}` } })
      .catch(() => {});
  }
}
