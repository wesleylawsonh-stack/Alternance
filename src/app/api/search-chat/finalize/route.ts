import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject, toJsonString } from "@/lib/json";
import { finalizeSearchProfile, type ChatMessage, type SearchChatContext } from "@/lib/ai";
import { recomputeAllOfferScores } from "@/lib/recompute";
import type { ParsedCv } from "@/lib/cvParser";

const EMPTY_SECTIONS: ParsedCv["sections"] = { summary: null, experiences: [], education: [], languages: [] };

function parseMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is ChatMessage =>
      !!m &&
      typeof m === "object" &&
      ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
      typeof (m as ChatMessage).content === "string"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const messages = parseMessages(body.messages);

  const [profile, criteria] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.criteria.findUnique({ where: { id: "singleton" } }),
  ]);

  const existingSections = asObject(profile?.cvSections, EMPTY_SECTIONS);
  const context: SearchChatContext = {
    existingSearchDescription: criteria?.searchDescription ?? null,
    jobTitles: asStringArray(criteria?.jobTitles),
    locations: asStringArray(criteria?.locations),
    cvEducation: existingSections.education,
    cvSkills: asStringArray(profile?.cvSkills),
  };

  let result: { searchDescription: string; educationAdditions: string[] };
  try {
    result = await finalizeSearchProfile(messages, context);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  await prisma.criteria.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", searchDescription: result.searchDescription },
    update: { searchDescription: result.searchDescription },
  });

  // N'ajoute que des faits reellement nouveaux (jamais de doublon, jamais
  // de suppression/ecrasement de ce qui existe deja).
  let updatedEducation = existingSections.education;
  if (result.educationAdditions.length > 0 && profile) {
    const existingSet = new Set(existingSections.education.map((e) => e.toLowerCase().trim()));
    const newOnes = result.educationAdditions.filter((e) => !existingSet.has(e.toLowerCase().trim()));
    if (newOnes.length > 0) {
      updatedEducation = [...existingSections.education, ...newOnes];
      await prisma.profile.update({
        where: { id: "singleton" },
        data: { cvSections: toJsonString({ ...existingSections, education: updatedEducation }) },
      });
    }
  }

  const updatedOffers = await recomputeAllOfferScores();

  return NextResponse.json({
    searchDescription: result.searchDescription,
    educationAdditions: result.educationAdditions,
    updatedEducation,
    updatedOffers,
  });
}
