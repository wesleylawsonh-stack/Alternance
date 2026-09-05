import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject, toJsonString } from "@/lib/json";
import { applyCvEditDecisions, cvVersionLabel, type EditDecision } from "@/lib/cvVersion";
import type { CvEditProposal } from "@/lib/ai";
import type { CvContent } from "@/lib/cvTemplate";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const offerId: string | undefined = typeof body.offerId === "string" ? body.offerId : undefined;
  const proposals: CvEditProposal[] = Array.isArray(body.proposals) ? body.proposals : [];
  const decisions: EditDecision[] = Array.isArray(body.decisions) ? body.decisions : [];

  const [profile, offer] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    offerId ? prisma.offer.findUnique({ where: { id: offerId } }) : Promise.resolve(null),
  ]);

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Aucun CV importe." }, { status: 400 });
  }
  if (offerId && !offer) {
    return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  }

  const sections = asObject(profile.cvSections, EMPTY_SECTIONS);
  const baseContent: CvContent = {
    headline: profile.headline,
    summary: sections.summary,
    skills: asStringArray(profile.cvSkills),
    experiences: sections.experiences,
    education: sections.education,
    languages: sections.languages,
  };

  const { content } = applyCvEditDecisions(baseContent, profile.headline, proposals, decisions);

  const kind = offer ? "OFFER_ADAPTED" : "IMPROVED";
  const label = cvVersionLabel(kind, offer?.company, offer?.title);

  const version = await prisma.cvVersion.create({
    data: {
      kind,
      label,
      offerId: offer?.id ?? null,
      offerTitle: offer?.title ?? null,
      offerCompany: offer?.company ?? null,
      content: toJsonString(content),
    },
  });

  return NextResponse.json({
    version: { id: version.id, label: version.label, kind: version.kind, createdAt: version.createdAt },
  });
}
