// On importe uniquement le client Gmail (pas le paquet "googleapis" complet,
// qui embarque ~300 API Google et fait exploser la taille des fonctions
// serverless au deploiement). Le client OAuth2 vient du meme paquet pour
// eviter tout conflit de types entre deux copies de google-auth-library.
import { gmail as gmailClient, auth } from "@googleapis/gmail";
import { prisma } from "./db";

// gmail.send est necessaire pour le digest d'offres (voir emailDigest.ts) :
// un compte deja connecte avant l'ajout de ce scope doit etre reconnecte
// (bouton "Deconnecter" puis "Connecter Gmail") pour l'obtenir - Google ne
// l'accorde pas retroactivement a un token deja emis.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function isGmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI);
}

function createOAuthClient() {
  return new auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

export function getGoogleAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force le renvoi d'un refresh_token meme si deja autorise avant
    scope: SCOPES,
  });
}

export async function exchangeCodeAndStoreAccount(code: string): Promise<{ email: string | null }> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "Google n'a pas renvoye de refresh_token. Revoque l'acces existant sur https://myaccount.google.com/permissions puis reessaie."
    );
  }

  client.setCredentials(tokens);

  const gmail = gmailClient({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress ?? null;

  await prisma.gmailAccount.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    update: {
      email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token ?? null,
      accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      lastSyncError: null,
    },
  });

  return { email };
}

export async function disconnectGmail(): Promise<void> {
  await prisma.gmailAccount.deleteMany({ where: { id: "singleton" } });
}

/**
 * Charge un client OAuth authentifie a partir du compte stocke en base.
 * Persiste automatiquement les nouveaux access tokens obtenus par refresh.
 */
export async function getAuthorizedGmailClient() {
  const account = await prisma.gmailAccount.findUnique({ where: { id: "singleton" } });
  if (!account) return null;

  const client = createOAuthClient();
  client.setCredentials({
    refresh_token: account.refreshToken,
    access_token: account.accessToken ?? undefined,
    expiry_date: account.accessTokenExpiry ? account.accessTokenExpiry.getTime() : undefined,
  });

  client.on("tokens", (tokens) => {
    if (tokens.access_token) {
      prisma.gmailAccount
        .update({
          where: { id: "singleton" },
          data: {
            accessToken: tokens.access_token,
            accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          },
        })
        .catch((err) => console.error("Impossible de sauvegarder le nouveau token Gmail:", err));
    }
  });

  return client;
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type GmailAttachment = { filename: string; mimeType: string; content: Buffer };

/**
 * Envoie un email au format HTML via l'API Gmail (necessite le scope
 * gmail.send - voir SCOPES ci-dessus). Le sujet est encode en RFC 2047
 * (mot encode) pour supporter les accents. Une piece jointe optionnelle
 * (ex: CV en PDF) est ajoutee via un message MIME multipart/mixed.
 */
export async function sendGmailMessage(
  client: Awaited<ReturnType<typeof getAuthorizedGmailClient>>,
  params: { to: string; subject: string; html: string; attachment?: GmailAttachment }
): Promise<void> {
  if (!client) throw new Error("Compte Gmail non connecte.");
  const gmail = gmailClient({ version: "v1", auth: client });

  const encodedSubject = `=?UTF-8?B?${Buffer.from(params.subject, "utf-8").toString("base64")}?=`;
  const headers = [`To: ${params.to}`, `Subject: ${encodedSubject}`, "MIME-Version: 1.0"];

  let message: string;
  if (params.attachment) {
    const boundary = `mixed_${crypto.randomUUID().replace(/-/g, "")}`;
    const base64Content = params.attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      params.html,
      "",
      `--${boundary}`,
      `Content-Type: ${params.attachment.mimeType}; name="${params.attachment.filename}"`,
      `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Content,
      "",
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    message = [...headers, "Content-Type: text/html; charset=UTF-8", "", params.html].join("\r\n");
  }

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodeBase64Url(message) },
  });
}

export type GmailMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  internalDate: Date;
};

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// Parcourt recursivement les parties MIME pour extraire le texte brut (ou a defaut le HTML nettoye).
function extractBodyText(payload: unknown): string {
  type Part = {
    mimeType?: string;
    body?: { data?: string };
    parts?: Part[];
  };
  const p = payload as Part | undefined;
  if (!p) return "";

  if (p.mimeType === "text/plain" && p.body?.data) {
    return decodeBase64Url(p.body.data);
  }

  if (p.parts) {
    for (const part of p.parts) {
      const text = extractBodyText(part);
      if (text) return text;
    }
  }

  if (p.mimeType === "text/html" && p.body?.data) {
    const html = decodeBase64Url(p.body.data);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  return "";
}

/**
 * Recupere les messages recus depuis `afterDate`, hors messages deja traites
 * (identifiants presents dans `excludeIds`). Limite a `maxResults` messages
 * par appel pour rester raisonnable.
 */
export async function fetchRecentGmailMessages(
  client: Awaited<ReturnType<typeof getAuthorizedGmailClient>>,
  afterDate: Date,
  excludeIds: Set<string>,
  maxResults = 30
): Promise<GmailMessage[]> {
  if (!client) return [];
  const gmail = gmailClient({ version: "v1", auth: client });

  const afterEpochSeconds = Math.floor(afterDate.getTime() / 1000);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: `in:inbox after:${afterEpochSeconds}`,
    maxResults,
  });

  const ids = (list.data.messages ?? []).map((m) => m.id!).filter((id) => id && !excludeIds.has(id));

  const messages: GmailMessage[] = [];
  for (const id of ids) {
    const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    const headers = res.data.payload?.headers ?? [];
    const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
    const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";
    const bodyText = extractBodyText(res.data.payload);

    messages.push({
      id,
      from,
      subject,
      snippet: res.data.snippet ?? "",
      bodyText: bodyText.slice(0, 4000),
      internalDate: res.data.internalDate ? new Date(Number(res.data.internalDate)) : new Date(),
    });
  }

  return messages;
}
