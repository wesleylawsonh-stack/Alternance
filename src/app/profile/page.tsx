"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Profile = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  summary: string | null;
  linkedin: string | null;
  cvFileName: string | null;
  cvSkills: unknown;
};

const EMPTY: Profile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  summary: "",
  linkedin: "",
  cvFileName: null,
  cvSkills: [],
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [suggestingHeadline, setSuggestingHeadline] = useState(false);
  const [headlineError, setHeadlineError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile({ ...EMPTY, ...data.profile });
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    if (data.profile) setProfile({ ...EMPTY, ...data.profile });
    setSaving(false);
    setSavedMsg("Profil enregistre.");
    setTimeout(() => setSavedMsg(null), 3000);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadInfo(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/cv/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Erreur lors de l'import du CV.");
      } else {
        setProfile((p) => ({
          ...p,
          cvFileName: data.profile.cvFileName,
          cvSkills: data.profile.cvSkills,
          headline: data.profile.headline,
        }));
        const headlineNote = data.suggestedHeadline
          ? data.profile.headline === data.suggestedHeadline
            ? ` Accroche suggeree automatiquement (modifiable ci-dessous).`
            : ` Une accroche a ete suggeree, clique sur "Suggerer une accroche" pour l'utiliser.`
          : "";
        setUploadInfo(
          `CV importe : ${data.skillsFound.length} competence(s) detectee(s). ${
            data.updatedOffers ? `${data.updatedOffers} offre(s) recalculee(s).` : ""
          }${headlineNote}`
        );
      }
    } catch {
      setUploadError("Erreur reseau lors de l'import du CV.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSuggestHeadline() {
    setSuggestingHeadline(true);
    setHeadlineError(null);
    try {
      const res = await fetch("/api/profile/suggest-headline", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setHeadlineError(data.error || "Impossible de generer une accroche.");
      } else {
        setProfile((p) => ({ ...p, headline: data.suggestedHeadline }));
      }
    } catch {
      setHeadlineError("Erreur reseau.");
    } finally {
      setSuggestingHeadline(false);
    }
  }

  const skills: string[] = Array.isArray(profile.cvSkills) ? (profile.cvSkills as string[]) : [];

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Profil</h1>
        <p className="text-slate-500 mt-1">Tes informations et ton CV, utilises pour calculer le matching et adapter tes candidatures.</p>
      </div>

      <section className="card p-6">
        <h2 className="text-lg font-medium mb-4">CV (PDF)</h2>
        <div className="flex items-center gap-4">
          <label className="btn-primary cursor-pointer">
            {uploading ? "Import en cours..." : profile.cvFileName ? "Remplacer le CV" : "Importer un CV (PDF)"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
          {profile.cvFileName && <span className="text-sm text-slate-600">{profile.cvFileName}</span>}
        </div>
        {uploadError && <p className="text-sm text-red-600 mt-3">{uploadError}</p>}
        {uploadInfo && <p className="text-sm text-green-700 mt-3">{uploadInfo}</p>}

        {skills.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Competences detectees dans le CV :</p>
            <div className="flex flex-wrap gap-2">
              {skills.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {profile.cvFileName && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-medium text-slate-800">Analyser et ameliorer mon CV</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Accroche, descriptions d&apos;experiences, competences : revois chaque proposition avant de valider.
              </p>
            </div>
            <Link className="btn-primary" href="/cv-editor">
              Analyser et ameliorer mon CV
            </Link>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-medium mb-4">Informations personnelles</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nom complet</label>
              <input
                className="input"
                value={profile.fullName ?? ""}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">Titre / accroche</label>
                <button
                  type="button"
                  className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                  onClick={handleSuggestHeadline}
                  disabled={suggestingHeadline || !profile.cvFileName}
                  title={!profile.cvFileName ? "Importe d'abord ton CV" : undefined}
                >
                  {suggestingHeadline ? "Generation..." : "Suggerer depuis mon CV"}
                </button>
              </div>
              <input
                className="input"
                placeholder="Ex: Etudiant en informatique - Alternance dev web"
                value={profile.headline ?? ""}
                onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
              />
              {headlineError && <p className="text-xs text-red-600 mt-1">{headlineError}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={profile.email ?? ""}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Telephone</label>
              <input
                className="input"
                value={profile.phone ?? ""}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Localisation</label>
              <input
                className="input"
                placeholder="Ex: Paris, France"
                value={profile.location ?? ""}
                onChange={(e) => setProfile({ ...profile, location: e.target.value })}
              />
            </div>
            <div>
              <label className="label">LinkedIn</label>
              <input
                className="input"
                value={profile.linkedin ?? ""}
                onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Resume / a propos</label>
            <textarea
              className="input"
              rows={4}
              value={profile.summary ?? ""}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
            {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
