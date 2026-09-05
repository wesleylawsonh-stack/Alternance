import { NextRequest, NextResponse } from "next/server";
import { runGmailSync } from "@/lib/gmailSync";

// Protege l'endpoint quand CRON_SECRET est defini (utile des que le site est
// deployé et appelable publiquement par une tache planifiee). En local, sans
// CRON_SECRET, l'endpoint reste ouvert pour que le bouton "Synchroniser
// maintenant" fonctionne sans configuration.
function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Non autorise." }, { status: 401 });
  }

  try {
    const result = await runGmailSync();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Erreur synchronisation Gmail:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur lors de la synchronisation." },
      { status: 500 }
    );
  }
}

// Vercel Cron declenche des requetes GET ; on les traite comme POST.
export async function GET(req: NextRequest) {
  return POST(req);
}
