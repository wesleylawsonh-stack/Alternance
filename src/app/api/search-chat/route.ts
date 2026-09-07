import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { chatSearchProfileTurn, type ChatMessage, type SearchChatContext } from "@/lib/ai";
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

  const context: SearchChatContext = {
    existingSearchDescription: criteria?.searchDescription ?? null,
    jobTitles: asStringArray(criteria?.jobTitles),
    locations: asStringArray(criteria?.locations),
    cvEducation: asObject(profile?.cvSections, EMPTY_SECTIONS).education,
    cvSkills: asStringArray(profile?.cvSkills),
  };

  try {
    const reply = await chatSearchProfileTurn(messages, context);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
