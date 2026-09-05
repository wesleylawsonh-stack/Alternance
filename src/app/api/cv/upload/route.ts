import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { extractTextFromPdf } from "@/lib/pdfText";
import { parseCvText } from "@/lib/cvParser";
import { recomputeAllOfferScores } from "@/lib/recompute";
import { toJsonString } from "@/lib/json";
import { serializeProfile } from "@/lib/serialize";
import { suggestHeadline } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier PDF recu." }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Le fichier doit etre un PDF." }, { status: 400 });
  }

  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Le fichier depasse la taille maximale de 10 Mo." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawText: string;
  try {
    rawText = await extractTextFromPdf(buffer);
  } catch (err) {
    console.error("Echec extraction PDF:", err);
    return NextResponse.json(
      { error: "Impossible de lire ce PDF. Verifie qu'il n'est pas protege ou scanne en image." },
      { status: 422 }
    );
  }

  if (!rawText || rawText.trim().length < 20) {
    return NextResponse.json(
      { error: "Le texte extrait du PDF est vide ou trop court (CV scanne en image ?)." },
      { status: 422 }
    );
  }

  const parsed = parseCvText(rawText);

  const profile = await prisma.profile.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      cvFileName: file.name,
      cvRawText: parsed.rawText,
      cvSkills: toJsonString(parsed.skills),
      cvSections: toJsonString(parsed.sections),
    },
    update: {
      cvFileName: file.name,
      cvRawText: parsed.rawText,
      cvSkills: toJsonString(parsed.skills),
      cvSections: toJsonString(parsed.sections),
    },
  });

  const updatedOffers = await recomputeAllOfferScores();

  // Propose une accroche a partir du CV : on ne l'applique automatiquement
  // que si aucune accroche n'est deja renseignee, pour ne jamais ecraser un
  // texte choisi par l'utilisateur.
  let finalProfile = profile;
  let suggestedHeadline: string | null = null;
  let headlineUsedAi = false;
  try {
    const suggestion = await suggestHeadline({
      rawText: parsed.rawText,
      skills: parsed.skills,
      sections: parsed.sections,
    });
    suggestedHeadline = suggestion.text;
    headlineUsedAi = suggestion.usedAi;

    if (suggestedHeadline && !profile.headline) {
      finalProfile = await prisma.profile.update({
        where: { id: "singleton" },
        data: { headline: suggestedHeadline },
      });
    }
  } catch (err) {
    console.error("Suggestion d'accroche impossible:", err);
  }

  return NextResponse.json({
    profile: serializeProfile(finalProfile),
    skillsFound: parsed.skills,
    updatedOffers,
    suggestedHeadline,
    headlineUsedAi,
  });
}
