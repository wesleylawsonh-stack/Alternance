import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asObject } from "@/lib/json";
import { renderCvPdf, type CvContent } from "@/lib/cvTemplate";

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [version, profile] = await Promise.all([
    prisma.cvVersion.findUnique({ where: { id } }),
    prisma.profile.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!version) return NextResponse.json({ error: "Version de CV introuvable." }, { status: 404 });

  const content = asObject<CvContent>(version.content, EMPTY_CONTENT);
  const pdfBytes = await renderCvPdf(content, {
    fullName: profile?.fullName ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    location: profile?.location ?? null,
    linkedin: profile?.linkedin ?? null,
  });

  const filename = `${slugify(version.label) || "cv"}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
