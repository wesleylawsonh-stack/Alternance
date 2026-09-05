"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import ScoreBadge from "@/components/ScoreBadge";
import StatusSelect from "@/components/StatusSelect";

type Offer = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string;
  contractType: string | null;
  source: string;
  matchScore: number | null;
  matchedSkills: unknown;
  missingSkills: unknown;
  requiredSkills: unknown;
  applicationStatus: string;
  adaptedCvText: string | null;
  adaptedCvGeneratedAt: string | null;
};

export default function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState<string | null>(null);
  const [adaptInfo, setAdaptInfo] = useState<string | null>(null);

  function load() {
    fetch(`/api/offers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setOffer(data.offer ?? null);
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

  async function handleAdapt() {
    setAdapting(true);
    setAdaptError(null);
    setAdaptInfo(null);
    try {
      const res = await fetch(`/api/offers/${id}/adapt-cv`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAdaptError(data.error || "Erreur lors de l'adaptation du CV.");
      } else {
        setOffer(data.offer);
        setAdaptInfo(data.usedAi ? "CV adapte genere par l'IA." : "CV adapte genere (mode sans IA : reordonnancement du contenu existant).");
      }
    } catch {
      setAdaptError("Erreur reseau.");
    } finally {
      setAdapting(false);
    }
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;
  if (!offer) return <p className="text-slate-500">Offre introuvable.</p>;

  const matched = Array.isArray(offer.matchedSkills) ? (offer.matchedSkills as string[]) : [];
  const missing = Array.isArray(offer.missingSkills) ? (offer.missingSkills as string[]) : [];

  return (
    <div className="space-y-6">
      <Link href="/offers" className="text-sm text-brand-600 hover:underline">
        ← Retour aux offres
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{offer.title}</h1>
            <p className="text-slate-500 mt-1">
              {[offer.company, offer.location, offer.contractType].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ScoreBadge score={offer.matchScore} />
            <StatusSelect value={offer.applicationStatus} onChange={handleStatusChange} />
          </div>
        </div>

        {offer.url && (
          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 text-sm text-brand-600 hover:underline"
          >
            Voir l&apos;offre originale ↗
          </a>
        )}
      </div>

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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-medium text-slate-900">CV adapte pour cette offre</h2>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={handleAdapt} disabled={adapting}>
              {adapting ? "Adaptation en cours..." : "Adapter mon CV"}
            </button>
            {offer.adaptedCvText && (
              <a className="btn-secondary" href={`/api/offers/${id}/adapted-cv/download`}>
                Telecharger le PDF
              </a>
            )}
          </div>
        </div>
        {adaptError && <p className="text-sm text-red-600 mt-3">{adaptError}</p>}
        {adaptInfo && <p className="text-sm text-green-700 mt-3">{adaptInfo}</p>}
        {offer.adaptedCvText && (
          <pre className="mt-4 text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-lg p-4 border border-slate-200">
            {offer.adaptedCvText}
          </pre>
        )}
        {!offer.adaptedCvText && !adapting && (
          <p className="text-sm text-slate-400 mt-3">
            Aucun CV adapte genere pour l&apos;instant. Clique sur &quot;Adapter mon CV&quot; (le CV original doit d&apos;abord etre importe sur la page Profil).
          </p>
        )}
      </div>
    </div>
  );
}
