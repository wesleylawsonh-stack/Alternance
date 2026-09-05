"use client";

import { useEffect, useState } from "react";
import SearchProfileChat from "@/components/SearchProfileChat";
import LocationInput from "@/components/LocationInput";

type Criteria = {
  jobTitles: string[];
  locations: string[];
  contractTypes: string[];
  remote: boolean;
  keywords: string[];
  excludeKeywords: string[];
  minSalary: number | null;
  radiusKm: number | null;
  searchDescription: string;
  autoFetchEnabled: boolean;
};

const EMPTY: Criteria = {
  jobTitles: [],
  locations: [],
  contractTypes: [],
  remote: false,
  keywords: [],
  excludeKeywords: [],
  minSalary: null,
  radiusKm: null,
  searchDescription: "",
  autoFetchEnabled: true,
};

const CONTRACT_OPTIONS = ["Alternance", "Stage", "CDI", "CDD", "Interim"];

function arrToText(arr: string[]): string {
  return arr.join(", ");
}
function textToArr(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function CriteriaPage() {
  const [criteria, setCriteria] = useState<Criteria>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/criteria")
      .then((r) => r.json())
      .then((data) => {
        if (data.criteria) {
          setCriteria({
            jobTitles: data.criteria.jobTitles ?? [],
            locations: data.criteria.locations ?? [],
            contractTypes: data.criteria.contractTypes ?? [],
            remote: !!data.criteria.remote,
            keywords: data.criteria.keywords ?? [],
            excludeKeywords: data.criteria.excludeKeywords ?? [],
            minSalary: data.criteria.minSalary,
            radiusKm: data.criteria.radiusKm,
            searchDescription: data.criteria.searchDescription ?? "",
            autoFetchEnabled: data.criteria.autoFetchEnabled ?? true,
          });
        }
        setLoading(false);
      });
  }, []);

  function toggleContractType(type: string) {
    setCriteria((c) => ({
      ...c,
      contractTypes: c.contractTypes.includes(type)
        ? c.contractTypes.filter((t) => t !== type)
        : [...c.contractTypes, type],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    const res = await fetch("/api/criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(criteria),
    });
    const data = await res.json();
    setSaving(false);
    setSavedMsg(`Criteres enregistres. ${data.updatedOffers ?? 0} offre(s) recalculee(s).`);
    setTimeout(() => setSavedMsg(null), 4000);
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Criteres de recherche</h1>
        <p className="text-slate-500 mt-1">
          Utilises pour la recuperation automatique d&apos;offres et pour affiner le score de matching.
        </p>
      </div>

      <form onSubmit={handleSave} className="card p-6 space-y-5">
        <div>
          <label className="label">Decris ce que tu recherches (optionnel)</label>
          <textarea
            className="input"
            rows={4}
            placeholder="Ex: Je cherche une alternance en developpement web, plutot frontend React, dans une petite structure ou startup, a Paris ou en remote partiel, rythme 3 semaines entreprise / 1 semaine ecole..."
            value={criteria.searchDescription}
            onChange={(e) => setCriteria({ ...criteria, searchDescription: e.target.value })}
          />
          <p className="text-xs text-slate-400 mt-1">
            Utilise en complement des criteres ci-dessous pour affiner le score de matching et donner du contexte
            a l&apos;IA lors de l&apos;adaptation de ton CV a une offre. Ou utilise la bulle de discussion en bas à
            droite pour que l&apos;IA t&apos;aide à la préciser.
          </p>
        </div>

        <div>
          <label className="label">Intitules de poste recherches (separes par des virgules)</label>
          <input
            className="input"
            placeholder="Ex: developpeur web, data analyst"
            value={arrToText(criteria.jobTitles)}
            onChange={(e) => setCriteria({ ...criteria, jobTitles: textToArr(e.target.value) })}
          />
        </div>

        <div>
          <label className="label">Localisations</label>
          <LocationInput
            value={criteria.locations}
            onChange={(locations) => setCriteria({ ...criteria, locations })}
          />
          <p className="text-xs text-slate-400 mt-1">
            Tape le début d&apos;un nom de ville pour la sélectionner dans la liste, ou une région (ex: &quot;Ile-de-France&quot;) pour
            inclure toutes les offres de cette région.
          </p>
        </div>

        <div>
          <label className="label">Types de contrat</label>
          <div className="flex flex-wrap gap-2">
            {CONTRACT_OPTIONS.map((type) => (
              <button
                type="button"
                key={type}
                onClick={() => toggleContractType(type)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                  criteria.contractTypes.includes(type)
                    ? "bg-brand-600 text-white border-brand-600"
                    : "bg-white text-slate-600 border-slate-300 hover:border-brand-400"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="remote"
            checked={criteria.remote}
            onChange={(e) => setCriteria({ ...criteria, remote: e.target.checked })}
            className="h-4 w-4"
          />
          <label htmlFor="remote" className="text-sm text-slate-700">
            Teletravail souhaite
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Salaire minimum (€ / an, optionnel)</label>
            <input
              type="number"
              className="input"
              value={criteria.minSalary ?? ""}
              onChange={(e) => setCriteria({ ...criteria, minSalary: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <label className="label">Rayon de recherche (km, optionnel)</label>
            <input
              type="number"
              className="input"
              value={criteria.radiusKm ?? ""}
              onChange={(e) => setCriteria({ ...criteria, radiusKm: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>

        <div>
          <label className="label">Mots-cles bonus (competences/technos importantes pour toi)</label>
          <input
            className="input"
            placeholder="Ex: React, gestion de projet"
            value={arrToText(criteria.keywords)}
            onChange={(e) => setCriteria({ ...criteria, keywords: textToArr(e.target.value) })}
          />
        </div>

        <div>
          <label className="label">Mots-cles a exclure</label>
          <input
            className="input"
            placeholder="Ex: senior, 5 ans d'experience"
            value={arrToText(criteria.excludeKeywords)}
            onChange={(e) => setCriteria({ ...criteria, excludeKeywords: textToArr(e.target.value) })}
          />
        </div>

        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autoFetch"
              checked={criteria.autoFetchEnabled}
              onChange={(e) => setCriteria({ ...criteria, autoFetchEnabled: e.target.checked })}
              className="h-4 w-4"
            />
            <label htmlFor="autoFetch" className="text-sm text-slate-700">
              Recuperation automatique quotidienne des offres
            </label>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Frequence : quotidienne (limite du plan Vercel Hobby). Tu peux toujours declencher une
            recuperation manuelle a tout moment depuis la page Offres, meme si cette option est desactivee.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
        </div>
      </form>

      {/* En dehors du <form> ci-dessus : un <form> imbrique y ferait
          remonter l'evenement "submit" au formulaire parent. */}
      <SearchProfileChat onFinalized={(searchDescription) => setCriteria((c) => ({ ...c, searchDescription }))} />
    </div>
  );
}
