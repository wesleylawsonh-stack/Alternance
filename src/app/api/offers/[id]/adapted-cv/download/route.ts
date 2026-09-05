import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateCvPdf } from "@/lib/pdfGenerate";

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

  const [offer, profile] = await Promise.all([
    prisma.offer.findUnique({ where: { id } }),
    prisma.profile.findUnique({ where: { id: "singleton" } }),
  ]);

  if (!offer) return NextResponse.json({ error: "Offre introuvable." }, { status: 404 });
  if (!offer.adaptedCvText) {
    return NextResponse.json({ error: "Aucun CV adapte n'a encore ete genere pour cette offre." }, { status: 400 });
  }

  const contactParts = [profile?.email, profile?.phone, profile?.location].filter(Boolean);
  const pdfBytes = await generateCvPdf({
    title: profile?.fullName || "CV",
    contactLine: contactParts.join(" · "),
    bodyText: offer.adaptedCvText,
  });

  const filename = `cv-${slugify(offer.title)}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
