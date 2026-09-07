"use client";

import { useEffect, useState } from "react";
import { SkeletonCardList } from "@/components/Skeleton";

type CvVersion = {
  id: string;
  kind: string;
  label: string;
  offerId: string | null;
  offerTitle: string | null;
  offerCompany: string | null;
  createdAt: string;
};

const KIND_LABELS: Record<string, string> = {
  IMPROVED: "CV ameliore",
  OFFER_ADAPTED: "Adapte a une offre",
};

export default function CvHistoryPage() {
  const [versions, setVersions] = useState<CvVersion[]>([]);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch("/api/cv-versions").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ]).then(([versionsData, profileData]) => {
      setVersions(versionsData.versions ?? []);
      setHasOriginal(Boolean(profileData.profile?.cvRawText));
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette version de CV ?")) return;
    setDeletingId(id);
    await fetch(`/api/cv-versions/${id}`, { method: "DELETE" });
    setDeletingId(null);
    load();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Mes CV</h1>
          <p className="text-slate-500 mt-1">
            Ton CV original, ses versions ameliorees et celles adaptees a des offres precises.
          </p>
        </div>
        <SkeletonCardList count={3} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mes CV</h1>
        <p className="text-slate-500 mt-1">
          Ton CV original, ses versions ameliorees et celles adaptees a des offres precises.
        </p>
      </div>

      {!hasOriginal ? (
        <p className="card p-6 text-center text-slate-500">
          Aucun CV importe pour l&apos;instant. Va sur la page Profil pour en importer un.
        </p>
      ) : (
        <div className="card p-4 flex items-center justify-between">
          <div>
            <h3 className="font-medium text-slate-900">CV original</h3>
            <p className="text-sm text-slate-500">Le fichier tel qu&apos;importe sur la page Profil.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <a className="btn-secondary" href="/api/profile/cv/download?preview=1" target="_blank" rel="noopener noreferrer">
              Previsualiser
            </a>
            <a className="btn-secondary" href="/api/profile/cv/download">
              Telecharger
            </a>
          </div>
        </div>
      )}

      {versions.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">
          Aucune version amelioree ou adaptee pour l&apos;instant.
        </p>
      ) : (
        <div className="space-y-3">
          {versions.map((v) => (
            <div key={v.id} className="card p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-slate-900 truncate">{v.label}</h3>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {KIND_LABELS[v.kind] ?? v.kind}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {[v.offerCompany, v.offerTitle].filter(Boolean).join(" · ") || "—"} ·{" "}
                  {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <a
                  className="btn-secondary"
                  href={`/api/cv-versions/${v.id}/download?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Previsualiser
                </a>
                <a className="btn-secondary" href={`/api/cv-versions/${v.id}/download`}>
                  Telecharger
                </a>
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(v.id)}
                  disabled={deletingId === v.id}
                >
                  {deletingId === v.id ? "..." : "Supprimer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
