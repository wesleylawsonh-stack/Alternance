import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { proposeCvEdits } from "@/lib/ai";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const offerId: string | undefined = typeof body.offerId === "string" ? body.offerId : undefined;

  const [profile, offer] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    offerId ? prisma.offer.findUnique({ where: { id: offerId } }) : Promise.resolve(null),
  ]);

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Importe d'abord ton CV (page Profil) avant de le modifier." }, { status: 400 });
  }
  if (offerId && !offer) {
    return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };

  const { proposals, usedAi } = await proposeCvEdits({
    cv,
    currentHeadline: profile.headline,
    offer: offer ? { title: offer.title, company: offer.company, description: offer.description } : null,
  });

  return NextResponse.json({
    proposals,
    usedAi,
    cv: { headline: profile.headline, summary: cv.sections.summary, skills: cv.skills, experiences: cv.sections.experiences },
    offer: offer ? { id: offer.id, title: offer.title, company: offer.company } : null,
  });
}
