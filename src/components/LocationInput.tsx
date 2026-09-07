"use client";

import { useEffect, useRef, useState } from "react";
import { searchRegions } from "@/lib/frenchRegions";

type Suggestion = { label: string; value: string; isRegion: boolean };

type Props = {
  value: string[];
  onChange: (locations: string[]) => void;
};

// Autocompletion de villes (API Adresse gouv.fr, gratuite/sans cle) +
// regions administratives francaises (frenchRegions.ts), pour permettre de
// chercher soit une ville precise soit une region entiere (ex: "Ile-de-
// France" -> toute offre dans un departement de cette region).
export default function LocationInput({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const regionMatches: Suggestion[] = searchRegions(q).map((name) => ({
        label: `🌍 ${name} (toute la région)`,
        value: name,
        isRegion: true,
      }));

      let cityMatches: Suggestion[] = [];
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&type=municipality&limit=6`
        );
        if (res.ok) {
          const json = (await res.json()) as {
            features?: Array<{ properties?: { label?: string; city?: string; context?: string } }>;
          };
          cityMatches = (json.features ?? [])
            .map((f) => f.properties?.label)
            .filter((label): label is string => Boolean(label))
            .map((label) => ({ label, value: label, isRegion: false }));
        }
      } catch {
        // Suggestions de villes indisponibles (reseau) : les regions
        // trouvees localement restent proposees, la recherche reste utilisable.
      }

      setSuggestions([...regionMatches, ...cityMatches]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  function addLocation(loc: string) {
    const trimmed = loc.trim();
    if (!trimmed || value.includes(trimmed)) {
      setQuery("");
      setOpen(false);
      return;
    }
    onChange([...value, trimmed]);
    setQuery("");
    setOpen(false);
  }

  function removeLocation(loc: string) {
    onChange(value.filter((l) => l !== loc));
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((loc) => (
          <span
            key={loc}
            className="inline-flex items-center gap-1 text-sm bg-brand-50 text-brand-700 px-2.5 py-1 rounded-full"
          >
            {loc}
            <button
              type="button"
              onClick={() => removeLocation(loc)}
              className="text-brand-500 hover:text-brand-800"
              aria-label={`Retirer ${loc}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        placeholder="Ex: Paris, Lyon, Ile-de-France..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) {
            e.preventDefault();
            addLocation(query);
          }
        }}
      />
      {open && (query.trim().length >= 2 || suggestions.length > 0) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading && <p className="px-3 py-2 text-xs text-slate-400">Recherche...</p>}
          {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => addLocation(query)}
            >
              Utiliser &quot;{query.trim()}&quot; tel quel
            </button>
          )}
          {suggestions.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${s.isRegion ? "font-medium text-brand-700" : "text-slate-700"}`}
              onClick={() => addLocation(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
