import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { asStringArray, asObject } from "@/lib/json";
import { cvContentFromProfile, renderCvPdf, fetchProfilePhoto } from "@/lib/cvTemplate";

const EMPTY_SECTIONS = { summary: null, experiences: [], education: [], languages: [] };

export async function GET(req: NextRequest) {
  const profile = await prisma.profile.findUnique({ where: { id: "singleton" } });

  if (!profile || !profile.cvRawText) {
    return NextResponse.json({ error: "Aucun CV importe." }, { status: 404 });
  }

  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const disposition = `${preview ? "inline" : "attachment"}; filename="CV_original.pdf"`;

  // Le fichier original tel qu'importe est disponible : on le sert a
  // l'identique (le plus fidele possible), plutot que de le reconstruire.
  if (profile.cvFileUrl) {
    const upstream = await fetch(profile.cvFileUrl);
    if (upstream.ok) {
      const bytes = await upstream.arrayBuffer();
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": disposition,
        },
      });
    }
  }

  // Repli : le fichier original n'a pas ete conserve (stockage Blob non
  // configure) -> on reconstruit un PDF propre a partir du texte deja
  // extrait. Ce n'est pas une copie exacte du fichier importe.
  const content = cvContentFromProfile({
    headline: profile.headline,
    cvSkills: asStringArray(profile.cvSkills),
    cvSections: asObject(profile.cvSections, EMPTY_SECTIONS),
  });

  const photo = await fetchProfilePhoto(profile.photoUrl);
  const pdfBytes = await renderCvPdf(
    content,
    {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedin: profile.linkedin,
    },
    photo
  );

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
    },
  });
}
