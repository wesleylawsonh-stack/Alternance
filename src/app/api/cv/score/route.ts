import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { scoreCv } from "@/lib/ai";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

export async function POST() {
  const [profile, criteria] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Importe d'abord ton CV (page Profil) avant de l'analyser." }, { status: 400 });
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };

  const { score, usedAi, aiError } = await scoreCv({
    cv,
    currentHeadline: profile.headline,
    targetJobTitles: asStringArray(criteria?.jobTitles),
  });

  return NextResponse.json({ score, usedAi, aiError });
}
