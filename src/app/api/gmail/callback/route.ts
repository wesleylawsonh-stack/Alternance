import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStoreAccount } from "@/lib/gmail";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const redirectBase = new URL("/integrations", req.nextUrl.origin);

  if (error) {
    redirectBase.searchParams.set("gmail_error", error);
    return NextResponse.redirect(redirectBase);
  }

  if (!code) {
    redirectBase.searchParams.set("gmail_error", "code_manquant");
    return NextResponse.redirect(redirectBase);
  }

  try {
    await exchangeCodeAndStoreAccount(code);
    redirectBase.searchParams.set("gmail_connected", "1");
  } catch (err) {
    console.error("Erreur callback Gmail:", err);
    redirectBase.searchParams.set("gmail_error", err instanceof Error ? err.message : "erreur_inconnue");
  }

  return NextResponse.redirect(redirectBase);
}
