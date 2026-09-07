import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asObject } from "@/lib/json";
import { renderCvPdf, fetchProfilePhoto, type CvContent } from "@/lib/cvTemplate";
import { getAuthorizedGmailClient, sendGmailMessage } from "@/lib/gmail";

const EMPTY_CONTENT: CvContent = { headline: null, summary: null, skills: [], experiences: [], education: [], languages: [] };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Marque une candidature preparee comme envoyee. Pour le canal EMAIL,
 * envoie reellement l'email (avec le CV adapte en piece jointe) via Gmail -
 * c'est le SEUL moment ou un envoi reel a lieu, toujours suite a cette
 * action explicite (jamais automatique). Pour le canal WEB, ne fait
 * qu'enregistrer que l'utilisateur a postule manuellement sur le site de
 * l'offre (l'envoi lui-meme s'est deja fait hors de l'application).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const draft = await prisma.applicationDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "Candidature preparee introuvable." }, { status: 404 });
  if (draft.status !== "PENDING") {
    return NextResponse.json({ error: "Cette candidature a deja ete traitee." }, { status: 400 });
  }

  const [offer, cvVersion, profile] = await Promise.all([
    prisma.offer.findUnique({ where: { id: draft.offerId } }),
    prisma.cvVersion.findUnique({ where: { id: draft.cvVersionId } }),
    prisma.profile.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!offer) return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });

  if (draft.applyChannel === "EMAIL") {
    const client = await getAuthorizedGmailClient();
    if (!client) {
      return NextResponse.json(
        { error: "Compte Gmail non connecte (necessaire pour envoyer une candidature par email). Connecte-le depuis la page Integrations." },
        { status: 400 }
      );
    }

    let attachment: { filename: string; mimeType: string; content: Buffer } | undefined;
    if (cvVersion) {
      const content = asObject<CvContent>(cvVersion.content, EMPTY_CONTENT);
      const photo = await fetchProfilePhoto(profile?.photoUrl);
      const pdfBytes = await renderCvPdf(
        content,
        {
          fullName: profile?.fullName ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          location: profile?.location ?? null,
          linkedin: profile?.linkedin ?? null,
        },
        photo
      );
      attachment = {
        filename: `${slugify(cvVersion.label) || "cv"}.pdf`,
        mimeType: "application/pdf",
        content: Buffer.from(pdfBytes),
      };
    }

    try {
      await sendGmailMessage(client, {
        to: draft.applyTarget,
        subject: `Candidature - ${offer.title}${offer.company ? ` (${offer.company})` : ""}`,
        html: draft.messageText.replace(/\n/g, "<br/>"),
        attachment,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Envoi de l'email echoue : ${message}` }, { status: 502 });
    }
  }

  const dateLabel = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const logLine =
    draft.applyChannel === "EMAIL"
      ? `[${dateLabel}] Candidature envoyee automatiquement par email a ${draft.applyTarget}.`
      : `[${dateLabel}] Candidature marquee comme envoyee (offre ouverte sur le site externe).`;
  const newComments = offer.comments ? `${offer.comments}\n${logLine}` : logLine;

  await Promise.all([
    prisma.applicationDraft.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } }),
    prisma.offer.update({
      where: { id: offer.id },
      data: { applicationStatus: "APPLIED", comments: newComments },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
