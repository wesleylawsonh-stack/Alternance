import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { suggestHeadline } from "@/lib/ai";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

export async function POST() {
  const profile = await prisma.profile.findUnique({ where: { id: "singleton" } });

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Importe d'abord ton CV (page Profil) avant de generer une accroche." }, { status: 400 });
  }

  const cv: ParsedCv = {
    rawText: profile.cvRawText,
    skills: asStringArray(profile.cvSkills),
    sections: asObject(profile.cvSections, EMPTY_SECTIONS),
  };

  const suggestion = await suggestHeadline(cv);

  if (!suggestion.text) {
    return NextResponse.json(
      { error: "Impossible de generer une accroche a partir de ce CV (contenu insuffisant)." },
      { status: 422 }
    );
  }

  return NextResponse.json({ suggestedHeadline: suggestion.text, usedAi: suggestion.usedAi });
}
