import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { serializeOffer } from "@/lib/serialize";
import { adaptCv } from "@/lib/ai";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [offer, profile] = await Promise.all([
    prisma.offer.findUnique({ where: { id } }),
    prisma.profile.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!offer) return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Importe d'abord ton CV (page Profil) avant d'adapter." }, { status: 400 });
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };

  const { text, usedAi } = await adaptCv({
    profile: {
      fullName: profile.fullName,
      headline: profile.headline,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
    },
    cv,
    offer: { title: offer.title, company: offer.company, description: offer.description },
    matchedSkills: asStringArray(offer.matchedSkills),
    missingSkills: asStringArray(offer.missingSkills),
  });

  const updated = await prisma.offer.update({
    where: { id },
    data: { adaptedCvText: text, adaptedCvGeneratedAt: new Date() },
  });

  return NextResponse.json({ offer: serializeOffer(updated), usedAi });
}
