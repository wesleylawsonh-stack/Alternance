import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { serializeProfile } from "@/lib/serialize";
import { uploadFile, deleteFile, isBlobConfigured } from "@/lib/storage";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: "Le stockage de fichiers (Vercel Blob) n'est pas configure. Ajoute BLOB_READ_WRITE_TOKEN pour activer la photo de profil." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Aucune image recue." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Format non supporte (PNG, JPEG ou WebP uniquement)." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "L'image depasse la taille maximale de 5 Mo." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

  const existingProfile = await prisma.profile.findUnique({ where: { id: "singleton" } });
  const photoUrl = await uploadFile(`photo/${Date.now()}-avatar.${ext}`, buffer, file.type);

  const profile = await prisma.profile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", photoUrl },
    update: { photoUrl },
  });

  if (existingProfile?.photoUrl && existingProfile.photoUrl !== photoUrl) {
    await deleteFile(existingProfile.photoUrl);
  }

  return NextResponse.json({ profile: serializeProfile(profile) });
}

export async function DELETE() {
  const existingProfile = await prisma.profile.findUnique({ where: { id: "singleton" } });
  if (!existingProfile) {
    return NextResponse.json({ profile: null });
  }
  if (existingProfile.photoUrl) {
    await deleteFile(existingProfile.photoUrl);
  }

  const profile = await prisma.profile.update({
    where: { id: "singleton" },
    data: { photoUrl: null },
  });

  return NextResponse.json({ profile: serializeProfile(profile) });
}
