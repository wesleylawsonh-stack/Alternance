"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ScoreBadge from "@/components/ScoreBadge";
import RecommendationBadge from "@/components/RecommendationBadge";
import StatusSelect, { STATUS_LABELS } from "@/components/StatusSelect";

type Offer = {
  id: string;
  title: string;
  company: string | null;
  companyLogoUrl: string | null;
  location: string | null;
  url: string | null;
  contractType: string | null;
  source: string;
  matchScore: number | null;
  missingSkills: unknown;
  applicationStatus: string;
  postedAt: string | null;
  fetchedAt: string;
  recommendation: string | null;
  mainReason: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Ajout manuel",
  france_travail: "France Travail",
  adzuna: "Adzuna",
  lba: "La bonne alternance",
};

const DATE_OPTIONS = [
  { value: "", label: "Toutes dates" },
  { value: "1", label: "Dernieres 24h" },
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
];

type Filters = {
  minScore: string;
  company: string;
  location: string;
  status: string;
  source: string;
  days: string;
};

const EMPTY_FILTERS: Filters = { minScore: "", company: "", location: "", status: "ALL", source: "ALL", days: "" };

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.minScore) params.set("minScore", filters.minScore);
    if (filters.company) params.set("company", filters.company);
    if (filters.location) params.set("location", filters.location);
    if (filters.status !== "ALL") params.set("status", filters.status);
    if (filters.source !== "ALL") params.set("source", filters.source);
    if (filters.days) {
      const d = new Date();
      d.setDate(d.getDate() - Number(filters.days));
      params.set("postedAfter", d.toISOString());
    }
    return params.toString();
  }, [filters]);

  function loadOffers() {
    setLoading(true);
    fetch(`/api/offers${queryString ? `?${queryString}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        setOffers(data.offers ?? []);
        setLoading(false);
      });
  }

  useEffect(loadOffers, [queryString]);

  async function handleFetchOffers() {
    setFetching(true);
    setFetchMsg(null);
    try {
      const res = await fetch("/api/offers/fetch", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFetchMsg(data.error || "Erreur lors de la recuperation des offres.");
      } else if (data.skipped !== undefined && data.created === undefined) {
        setFetchMsg("Recuperation automatique ignoree (desactivee dans les criteres).");
      } else {
        const errorNote = data.sourceErrors?.length ? ` Attention : ${data.sourceErrors.join(" | ")}` : "";
        setFetchMsg(
          `${data.created} nouvelle(s) offre(s) ajoutee(s) (${data.skipped} deja connue(s) ou filtree(s)).${errorNote}`
        );
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

  const activeFilterCount = Object.entries(filters).filter(
    ([key, v]) => v && !(key === "status" && v === "ALL") && !(key === "source" && v === "ALL")
  ).length;

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

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Filtres</p>
          {activeFilterCount > 0 && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Reinitialiser
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            className="input"
            value={filters.minScore}
            onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}
          >
            <option value="">Score minimum</option>
            <option value="80">80% et plus</option>
            <option value="60">60% et plus</option>
            <option value="40">40% et plus</option>
            <option value="20">20% et plus</option>
          </select>
          <input
            className="input"
            placeholder="Entreprise"
            value={filters.company}
            onChange={(e) => setFilters({ ...filters, company: e.target.value })}
          />
          <input
            className="input"
            placeholder="Lieu"
            value={filters.location}
            onChange={(e) => setFilters({ ...filters, location: e.target.value })}
          />
          <select
            className="input"
            value={filters.days}
            onChange={(e) => setFilters({ ...filters, days: e.target.value })}
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filters.source}
            onChange={(e) => setFilters({ ...filters, source: e.target.value })}
          >
            <option value="ALL">Toutes sources</option>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input sm:col-span-3 lg:col-span-1"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="ALL">Tous statuts</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Chargement...</p>
      ) : offers.length === 0 ? (
        <p className="text-slate-500 card p-6 text-center">
          Aucune offre ne correspond. Ajoutes-en une, lance une recuperation automatique, ou ajuste les filtres.
        </p>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const missing = Array.isArray(offer.missingSkills) ? (offer.missingSkills as string[]) : [];
            const displayDate = offer.postedAt ?? offer.fetchedAt;
            return (
              <div key={offer.id} className="card p-4 hover:border-brand-300 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/offers/${offer.id}`} className="min-w-0 flex gap-3 group">
                    {offer.companyLogoUrl ? (
                      <img
                        src={offer.companyLogoUrl}
                        alt=""
                        className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-sm font-semibold shrink-0">
                        {(offer.company || offer.title).slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-slate-900 truncate group-hover:underline">{offer.title}</h3>
                        {offer.contractType && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{offer.contractType}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {[offer.company, offer.location].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {new Date(displayDate).toLocaleDateString("fr-FR")} · {SOURCE_LABELS[offer.source] ?? offer.source}
                      </p>
                      {offer.mainReason && <p className="text-xs text-slate-400 mt-1 truncate">{offer.mainReason}</p>}
                      {missing.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          Competences manquantes : {missing.slice(0, 4).join(", ")}
                          {missing.length > 4 ? "…" : ""}
                        </p>
                      )}
                    </div>
                  </Link>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={offer.matchScore} />
                      <RecommendationBadge recommendation={offer.recommendation} />
                    </div>
                    <StatusSelect
                      value={offer.applicationStatus}
                      onChange={(status) => handleStatusChange(offer.id, status)}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-100">
                  {offer.url && (
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-slate-600 hover:text-brand-600 px-2.5 py-1 rounded-full bg-slate-50 hover:bg-slate-100"
                    >
                      Voir l&apos;offre ↗
                    </a>
                  )}
                  <Link
                    href={`/offers/${offer.id}`}
                    className="text-xs font-medium text-slate-600 hover:text-brand-600 px-2.5 py-1 rounded-full bg-slate-50 hover:bg-slate-100"
                  >
                    Voir le matching
                  </Link>
                  <Link
                    href={`/cv-editor?offerId=${offer.id}`}
                    className="text-xs font-medium text-slate-600 hover:text-brand-600 px-2.5 py-1 rounded-full bg-slate-50 hover:bg-slate-100"
                  >
                    Adapter mon CV
                  </Link>
                  <button
                    onClick={() => handleStatusChange(offer.id, "APPLIED")}
                    className="text-xs font-medium text-green-700 px-2.5 py-1 rounded-full bg-green-50 hover:bg-green-100"
                  >
                    Postuler
                  </button>
                  <button
                    onClick={() => handleStatusChange(offer.id, "REJECTED")}
                    className="text-xs font-medium text-red-600 px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
