import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeProfile } from "@/lib/serialize";

export async function GET() {
  const profile = await prisma.profile.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ profile: serializeProfile(profile) });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const data = {
    fullName: typeof body.fullName === "string" ? body.fullName : null,
    email: typeof body.email === "string" ? body.email : null,
    phone: typeof body.phone === "string" ? body.phone : null,
    location: typeof body.location === "string" ? body.location : null,
    headline: typeof body.headline === "string" ? body.headline : null,
    summary: typeof body.summary === "string" ? body.summary : null,
    linkedin: typeof body.linkedin === "string" ? body.linkedin : null,
  };

  const profile = await prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ profile: serializeProfile(profile) });
}
