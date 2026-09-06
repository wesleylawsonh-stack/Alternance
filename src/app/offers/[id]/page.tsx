"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import ScoreBadge from "@/components/ScoreBadge";
import RecommendationBadge from "@/components/RecommendationBadge";
import StatusSelect from "@/components/StatusSelect";

const SOURCE_LABELS: Record<string, string> = {
  manual: "Ajout manuel",
  france_travail: "France Travail",
  adzuna: "Adzuna",
  lba: "La bonne alternance",
};

type Offer = {
  id: string;
  title: string;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  url: string | null;
  description: string;
  contractType: string | null;
  source: string;
  postedAt: string | null;
  fetchedAt: string;
  matchScore: number | null;
  matchedSkills: unknown;
  missingSkills: unknown;
  requiredSkills: unknown;
  applicationStatus: string;
  comments: string | null;
  strengths: unknown;
  weaknesses: unknown;
  criteriaRespected: unknown;
  criteriaNotRespected: unknown;
  mainReason: string | null;
  recommendation: string | null;
};

type CvVersionSummary = {
  id: string;
  label: string;
  createdAt: string;
};

export default function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [cvVersions, setCvVersions] = useState<CvVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState("");
  const [savingComments, setSavingComments] = useState(false);
  const [commentsSaved, setCommentsSaved] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/offers/${id}`).then((r) => r.json()),
      fetch(`/api/cv-versions?offerId=${id}`).then((r) => r.json()),
    ]).then(([offerData, versionsData]) => {
      setOffer(offerData.offer ?? null);
      setComments(offerData.offer?.comments ?? "");
      setCvVersions(versionsData.versions ?? []);
      setLoading(false);
    });
  }

  useEffect(load, [id]);

  async function handleStatusChange(status: string) {
    if (!offer) return;
    setOffer({ ...offer, applicationStatus: status });
    await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationStatus: status }),
    });
  }

  async function handleSaveComments() {
    setSavingComments(true);
    setCommentsSaved(false);
    await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments }),
    });
    setSavingComments(false);
    setCommentsSaved(true);
    setTimeout(() => setCommentsSaved(false), 2500);
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;
  if (!offer) return <p className="text-slate-500">Offre introuvable.</p>;

  const matched = Array.isArray(offer.matchedSkills) ? (offer.matchedSkills as string[]) : [];
  const missing = Array.isArray(offer.missingSkills) ? (offer.missingSkills as string[]) : [];
  const strengths = Array.isArray(offer.strengths) ? (offer.strengths as string[]) : [];
  const weaknesses = Array.isArray(offer.weaknesses) ? (offer.weaknesses as string[]) : [];
  const criteriaRespected = Array.isArray(offer.criteriaRespected) ? (offer.criteriaRespected as string[]) : [];
  const criteriaNotRespected = Array.isArray(offer.criteriaNotRespected) ? (offer.criteriaNotRespected as string[]) : [];

  return (
    <div className="space-y-6">
      <Link href="/offers" className="text-sm text-brand-600 hover:underline">
        ← Retour aux offres
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            {offer.companyLogoUrl ? (
              <img
                src={offer.companyLogoUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-base font-semibold shrink-0">
                {(offer.company || offer.title).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{offer.title}</h1>
              <p className="text-slate-500 mt-1">
                {[offer.company, offer.location, offer.contractType].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Publiee le {new Date(offer.postedAt ?? offer.fetchedAt).toLocaleDateString("fr-FR")} · Source :{" "}
                {SOURCE_LABELS[offer.source] ?? offer.source}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <ScoreBadge score={offer.matchScore} />
              <RecommendationBadge recommendation={offer.recommendation} />
            </div>
            <StatusSelect value={offer.applicationStatus} onChange={handleStatusChange} />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {offer.url && (
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:underline"
            >
              Voir l&apos;offre originale ↗
            </a>
          )}
          <Link href={`/cv-editor?offerId=${id}&optimize=1`} className="btn-primary ml-auto">
            ✨ Optimiser ma candidature
          </Link>
        </div>
      </div>

      {(offer.mainReason || strengths.length > 0 || weaknesses.length > 0) && (
        <div className="card p-6">
          <h2 className="font-medium text-slate-900 mb-3">Analyse du matching</h2>
          {offer.mainReason && <p className="text-sm text-slate-700 mb-4">{offer.mainReason}</p>}

          {(criteriaRespected.length > 0 || criteriaNotRespected.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {criteriaRespected.map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full bg-green-50 text-green-800 text-xs font-medium">
                  ✓ {c}
                </span>
              ))}
              {criteriaNotRespected.map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium">
                  ✕ {c}
                </span>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Points forts</p>
                <ul className="space-y-1">
                  {strengths.map((s, i) => (
                    <li key={i} className="text-sm text-slate-600 flex gap-1.5">
                      <span className="text-green-600">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {weaknesses.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Points faibles</p>
                <ul className="space-y-1">
                  {weaknesses.map((w, i) => (
                    <li key={i} className="text-sm text-slate-600 flex gap-1.5">
                      <span className="text-red-500">−</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-2">Competences correspondantes ({matched.length})</h2>
          {matched.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune competence en commun detectee.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {matched.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-full bg-green-50 text-green-800 text-xs font-medium">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-2">Competences manquantes ({missing.length})</h2>
          {missing.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune competence manquante identifiee.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {missing.map((s) => (
                <span key={s} className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-medium text-slate-900 mb-3">Description de l&apos;offre</h2>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{offer.description}</p>
      </div>

      <div className="card p-6">
        <h2 className="font-medium text-slate-900 mb-3">Commentaires</h2>
        <textarea
          className="input"
          rows={5}
          placeholder="Notes personnelles, suivi de la candidature... (les mises a jour automatiques detectees par mail Gmail sont aussi journalisees ici)"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button className="btn-secondary" onClick={handleSaveComments} disabled={savingComments}>
            {savingComments ? "Enregistrement..." : "Enregistrer les commentaires"}
          </button>
          {commentsSaved && <span className="text-sm text-green-700">Enregistre.</span>}
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-medium text-slate-900">CV adapte pour cette offre</h2>
          <Link className="btn-primary" href={`/cv-editor?offerId=${id}`}>
            Adapter mon CV a cette offre
          </Link>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          Analyse l&apos;offre, propose des ameliorations de formulation et un reordonnancement des
          competences/experiences pertinentes, avec une revision avant/apres que tu valides toi-meme.
        </p>

        {cvVersions.length > 0 && (
          <div className="mt-4 space-y-2">
            {cvVersions.map((v) => (
              <div key={v.id} className="flex items-center justify-between bg-slate-50 rounded-lg p-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{v.label}</p>
                  <p className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString("fr-FR")}</p>
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
