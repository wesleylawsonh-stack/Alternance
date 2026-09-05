"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ScoreBadge from "@/components/ScoreBadge";
import RecommendationBadge from "@/components/RecommendationBadge";
import StatusSelect, { STATUS_LABELS } from "@/components/StatusSelect";

type Offer = {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  contractType: string | null;
  source: string;
  matchScore: number | null;
  missingSkills: unknown;
  applicationStatus: string;
  fetchedAt: string;
  recommendation: string | null;
  mainReason: string | null;
};

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  function loadOffers() {
    setLoading(true);
    fetch("/api/offers")
      .then((r) => r.json())
      .then((data) => {
        setOffers(data.offers ?? []);
        setLoading(false);
      });
  }

  useEffect(loadOffers, []);

  async function handleFetchOffers() {
    setFetching(true);
    setFetchMsg(null);
    try {
      const res = await fetch("/api/offers/fetch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFetchMsg(data.error || "Erreur lors de la recuperation des offres.");
      } else {
        setFetchMsg(`${data.created} nouvelle(s) offre(s) ajoutee(s) (${data.skipped} deja connue(s) ou filtree(s)).`);
        loadOffers();
      }
    } catch {
      setFetchMsg("Erreur reseau.");
    } finally {
      setFetching(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, applicationStatus: status } : o)));
    await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationStatus: status }),
    });
  }

  const filtered = statusFilter === "ALL" ? offers : offers.filter((o) => o.applicationStatus === statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Offres</h1>
          <p className="text-slate-500 mt-1">Triees par score de compatibilite avec ton CV.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? "Annuler" : "+ Ajouter une offre"}
          </button>
          <a className="btn-secondary" href="/api/offers/export">
            Exporter en Excel
          </a>
          <button className="btn-primary" onClick={handleFetchOffers} disabled={fetching}>
            {fetching ? "Recuperation..." : "Recuperer des offres"}
          </button>
        </div>
      </div>

      {fetchMsg && <p className="text-sm text-slate-600 card p-3">{fetchMsg}</p>}

      {showAddForm && <AddOfferForm onAdded={() => { setShowAddForm(false); loadOffers(); }} />}

      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip label="Toutes" active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")} />
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <FilterChip key={key} label={label} active={statusFilter === key} onClick={() => setStatusFilter(key)} />
        ))}
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 card p-6 text-center">Aucune offre pour l&apos;instant. Ajoutes-en une ou lance une recuperation automatique.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((offer) => {
            const missing = Array.isArray(offer.missingSkills) ? (offer.missingSkills as string[]) : [];
            return (
              <Link
                key={offer.id}
                href={`/offers/${offer.id}`}
                className="card p-4 flex items-center justify-between gap-4 hover:border-brand-300 transition-colors block"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-slate-900 truncate">{offer.title}</h3>
                    {offer.contractType && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{offer.contractType}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {offer.mainReason && <p className="text-xs text-slate-400 mt-1 truncate">{offer.mainReason}</p>}
                  {missing.length > 0 && (
                    <p className="text-xs text-slate-400 mt-1 truncate">
                      Competences manquantes : {missing.slice(0, 4).join(", ")}
                      {missing.length > 4 ? "…" : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0" onClick={(e) => e.preventDefault()}>
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={offer.matchScore} />
                    <RecommendationBadge recommendation={offer.recommendation} />
                  </div>
                  <StatusSelect
                    value={offer.applicationStatus}
                    onChange={(status) => handleStatusChange(offer.id, status)}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border ${
        active ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

function AddOfferForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({
    title: "",
    company: "",
    location: "",
    url: "",
    contractType: "",
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Erreur lors de l'ajout de l'offre.");
    } else {
      onAdded();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          className="input"
          placeholder="Titre du poste *"
          required
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          className="input"
          placeholder="Entreprise"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
        <input
          className="input"
          placeholder="Lieu"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <input
          className="input"
          placeholder="Type de contrat (ex: Alternance)"
          value={form.contractType}
          onChange={(e) => setForm({ ...form, contractType: e.target.value })}
        />
        <input
          className="input sm:col-span-2"
          placeholder="Lien vers l'offre"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
      </div>
      <textarea
        className="input"
        placeholder="Description complete de l'offre *"
        rows={5}
        required
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? "Ajout..." : "Ajouter l'offre"}
      </button>
    </form>
  );
}
