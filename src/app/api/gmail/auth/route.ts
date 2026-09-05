import { NextResponse } from "next/server";
import { getGoogleAuthUrl, isGmailConfigured } from "@/lib/gmail";

export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.json(
      { error: "Integration Gmail non configuree (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI manquants)." },
      { status: 400 }
    );
  }
  return NextResponse.redirect(getGoogleAuthUrl());
}
