import { put, del } from "@vercel/blob";

/**
 * Stockage de fichiers (CV originaux, photo de profil...) via Vercel Blob.
 * Necessite la variable d'environnement BLOB_READ_WRITE_TOKEN (creee
 * automatiquement en ajoutant un store "Blob" dans les parametres du
 * projet Vercel). Sans cette variable, les fonctions ci-dessous sont no-op
 * et l'appelant doit prevoir un repli (ex: reconstruire un PDF depuis le
 * texte deja extrait plutot que de stocker/servir le fichier original).
 */
export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadFile(pathname: string, data: Buffer, contentType: string): Promise<string | null> {
  if (!isBlobConfigured()) return null;
  const blob = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return blob.url;
}

export async function deleteFile(url: string): Promise<void> {
  if (!isBlobConfigured() || !url) return;
  try {
    await del(url);
  } catch (err) {
    console.error("Suppression du fichier stocke impossible:", err);
  }
}
