import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { generateApplicationMessage } from "@/lib/ai";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS = { summary: null, experiences: [] as string[], education: [] as string[], languages: [] as string[] };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const offerId: string | undefined = typeof body.offerId === "string" ? body.offerId : undefined;

  if (!offerId) {
    return NextResponse.json({ error: "offerId requis." }, { status: 400 });
  }

  const [profile, offer] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.offer.findUnique({ where: { id: offerId } }),
  ]);

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Aucun CV importe." }, { status: 400 });
  }
  if (!offer) {
    return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };
  const matchedSkills = asStringArray(offer.matchedSkills);

  const { text, usedAi, aiError } = await generateApplicationMessage({
    cv,
    headline: profile.headline,
    fullName: profile.fullName,
    offer: { title: offer.title, company: offer.company, description: offer.description },
    matchedSkills,
  });

  return NextResponse.json({ message: text, usedAi, aiError });
}
