import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isGmailConfigured } from "@/lib/gmail";

export async function GET() {
  const account = await prisma.gmailAccount.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({
    configured: isGmailConfigured(),
    connected: Boolean(account),
    email: account?.email ?? null,
    lastSyncAt: account?.lastSyncAt ?? null,
    lastSyncError: account?.lastSyncError ?? null,
    connectedAt: account?.connectedAt ?? null,
  });
}
