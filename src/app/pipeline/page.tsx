"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ScoreBadge from "@/components/ScoreBadge";
import StatusSelect from "@/components/StatusSelect";
import Skeleton from "@/components/Skeleton";

type Offer = {
  id: string;
  title: string;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  matchScore: number | null;
  applicationStatus: string;
  recommendation: string | null;
};

type ColumnKey = "TO_APPLY" | "APPLIED" | "INTERVIEW" | "OFFER" | "REJECTED";

const COLUMNS: { key: ColumnKey; label: string; targetStatus: string }[] = [
  { key: "TO_APPLY", label: "A postuler", targetStatus: "NOT_APPLIED" },
  { key: "APPLIED", label: "Postule", targetStatus: "APPLIED" },
  { key: "INTERVIEW", label: "Entretien", targetStatus: "INTERVIEW" },
  { key: "OFFER", label: "Offre recue", targetStatus: "OFFER" },
  { key: "REJECTED", label: "Refuse", targetStatus: "REJECTED" },
];

function bucketOf(offer: Offer): ColumnKey {
  if (offer.applicationStatus === "APPLIED") return "APPLIED";
  if (offer.applicationStatus === "INTERVIEW") return "INTERVIEW";
  if (offer.applicationStatus === "OFFER") return "OFFER";
  if (offer.applicationStatus === "REJECTED") return "REJECTED";
  return "TO_APPLY";
}

export default function PipelinePage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  function load() {
    fetch("/api/offers?status=ALL")
      .then((r) => r.json())
      .then((data) => {
        setOffers(data.offers ?? []);
        setLoading(false);
      });
  }

  useEffect(load, []);

  const buckets = useMemo(() => {
    const grouped: Record<ColumnKey, Offer[]> = {
      TO_APPLY: [],
      APPLIED: [],
      INTERVIEW: [],
      OFFER: [],
      REJECTED: [],
    };
    for (const offer of offers) {
      const key = bucketOf(offer);
      // La colonne "A postuler" ne sert qu'a visualiser les offres a fort
      // potentiel pas encore traitees : le reste (recommandation faible ou
      // a ignorer, ou pas encore calculee) reste sur la page Offres plutot
      // que d'encombrer le pipeline.
      if (key === "TO_APPLY" && offer.recommendation !== "POSTULER" && offer.recommendation !== "CONSIDERER") {
        continue;
      }
      grouped[key].push(offer);
    }
    return grouped;
  }, [offers]);

  async function moveOffer(offerId: string, newStatus: string) {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer || offer.applicationStatus === newStatus) return;

    setUpdatingId(offerId);
    setOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, applicationStatus: newStatus } : o)));

    await fetch(`/api/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationStatus: newStatus }),
    });
    setUpdatingId(null);
  }

  function handleDrop(e: React.DragEvent, targetStatus: string) {
    e.preventDefault();
    setDragOverColumn(null);
    const offerId = e.dataTransfer.getData("text/offer-id");
    if (offerId) moveOffer(offerId, targetStatus);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-64 mb-2" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex-shrink-0 w-72 card p-3 space-y-3 bg-slate-50/60">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalTracked = buckets.APPLIED.length + buckets.INTERVIEW.length + buckets.OFFER.length + buckets.REJECTED.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pipeline de candidatures</h1>
        <p className="text-slate-500 mt-1">
          Glisse une carte d&apos;une colonne a l&apos;autre (ou utilise le menu sur la carte) pour suivre l&apos;avancement
          de tes candidatures. {totalTracked} candidature(s) en cours de suivi.
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className={`flex-shrink-0 w-72 rounded-xl border-2 transition-colors ${
              dragOverColumn === col.key ? "border-brand-400 bg-brand-50/40" : "border-transparent"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(col.key);
            }}
            onDragLeave={() => setDragOverColumn((c) => (c === col.key ? null : c))}
            onDrop={(e) => handleDrop(e, col.targetStatus)}
          >
            <div className="card p-3 space-y-3 bg-slate-50/60 min-h-[200px]">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-medium text-slate-900 text-sm">{col.label}</h2>
                <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                  {buckets[col.key].length}
                </span>
              </div>

              <div className="space-y-2">
                {buckets[col.key].length === 0 && (
                  <p className="text-xs text-slate-400 px-1 py-4 text-center">Aucune offre ici.</p>
                )}
                {buckets[col.key].map((offer) => (
                  <div
                    key={offer.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/offer-id", offer.id)}
                    className={`card card-interactive p-3 space-y-2 cursor-grab active:cursor-grabbing bg-white ${
                      updatingId === offer.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {offer.companyLogoUrl ? (
                        <img
                          src={offer.companyLogoUrl}
                          alt=""
                          className="w-7 h-7 rounded object-contain bg-slate-50 border border-slate-100 shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-semibold shrink-0">
                          {(offer.company || offer.title).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link href={`/offers/${offer.id}`} className="text-sm font-medium text-slate-900 hover:underline line-clamp-2">
                          {offer.title}
                        </Link>
                        <p className="text-xs text-slate-500 truncate">
                          {[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <ScoreBadge score={offer.matchScore} />
                      <StatusSelect
                        value={offer.applicationStatus}
                        disabled={updatingId === offer.id}
                        onChange={(status) => moveOffer(offer.id, status)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
