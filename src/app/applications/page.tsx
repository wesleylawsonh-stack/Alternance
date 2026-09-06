"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Draft = {
  id: string;
  offerId: string;
  cvVersionId: string;
  messageText: string;
  applyChannel: "EMAIL" | "WEB";
  applyTarget: string;
  createdAt: string;
  offer: {
    id: string;
    title: string;
    company: string | null;
    companyLogoUrl: string | null;
    location: string | null;
    matchScore: number | null;
  };
};

export default function ApplicationsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [prepareMsg, setPrepareMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  function load() {
    Promise.all([
      fetch("/api/application-drafts").then((r) => r.json()),
      fetch("/api/criteria").then((r) => r.json()),
      fetch("/api/gmail/status").then((r) => r.json()),
    ]).then(([draftsData, criteriaData, gmailData]) => {
      setDrafts(draftsData.drafts ?? []);
      setAutoApplyEnabled(!!criteriaData.criteria?.autoApplyEnabled);
      setGmailConnected(!!gmailData.connected);
      setLoading(false);
    });
  }

  useEffect(load, []);

  async function handlePrepare() {
    setPreparing(true);
    setPrepareMsg(null);
    let total = 0;
    for (;;) {
      const res = await fetch("/api/application-drafts/prepare", { method: "POST" });
      const data = await res.json();
      const processed = data.processed ?? 0;
      total += processed;
      setPrepareMsg(`${total} candidature(s) preparee(s)...`);
      if (processed === 0 || (data.remaining ?? 0) === 0) break;
    }
    setPreparing(false);
    setPrepareMsg(total > 0 ? `${total} nouvelle(s) candidature(s) preparee(s).` : "Aucune nouvelle candidature a preparer.");
    setTimeout(() => setPrepareMsg(null), 6000);
    load();
  }

  function updateMessage(id: string, messageText: string) {
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, messageText } : d)));
  }

  async function handleSaveMessage(id: string) {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    setSavingId(id);
    await fetch(`/api/application-drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageText: draft.messageText }),
    });
    setSavingId(null);
  }

  async function handleSend(id: string) {
    setSendingId(id);
    setErrorById((e) => ({ ...e, [id]: "" }));
    const res = await fetch(`/api/application-drafts/${id}/send`, { method: "POST" });
    const data = await res.json();
    setSendingId(null);
    if (!res.ok) {
      setErrorById((e) => ({ ...e, [id]: data.error || "Erreur lors de l'envoi." }));
      return;
    }
    setDrafts((ds) => ds.filter((d) => d.id !== id));
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/application-drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DISMISSED" }),
    });
    setDrafts((ds) => ds.filter((d) => d.id !== id));
  }

  if (loading) return <p className="text-slate-500">Chargement...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Candidatures a valider</h1>
        <p className="text-slate-500 mt-1">
          Pour chaque offre a fort potentiel, un CV adapte et un message de candidature sont generes ici. Rien
          n&apos;est envoye sans ta validation.
        </p>
      </div>

      {!autoApplyEnabled && (
        <div className="card p-4 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          La preparation automatique n&apos;est pas activee. Active-la depuis la page{" "}
          <Link href="/criteria" className="underline">
            Criteres
          </Link>{" "}
          pour que de nouvelles candidatures apparaissent ici automatiquement.
        </div>
      )}

      <div className="card p-4 flex items-center gap-3 flex-wrap">
        <button className="btn-primary" onClick={handlePrepare} disabled={preparing || !autoApplyEnabled}>
          {preparing ? "Preparation..." : "Preparer les candidatures pour les offres a fort potentiel"}
        </button>
        {prepareMsg && <span className="text-sm text-green-700">{prepareMsg}</span>}
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune candidature en attente de validation pour le moment.</p>
      ) : (
        <div className="space-y-4">
          {drafts.map((draft) => (
            <div key={draft.id} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex gap-3">
                  {draft.offer.companyLogoUrl ? (
                    <img
                      src={draft.offer.companyLogoUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center text-sm font-semibold shrink-0">
                      {(draft.offer.company || draft.offer.title).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <Link href={`/offers/${draft.offer.id}`} className="font-medium text-slate-900 hover:underline">
                      {draft.offer.title}
                    </Link>
                    <p className="text-sm text-slate-500">
                      {[draft.offer.company, draft.offer.location].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
                  {draft.applyChannel === "EMAIL" ? `Par email : ${draft.applyTarget}` : "Candidature sur le site externe"}
                </span>
              </div>

              <div>
                <label className="label">Message de candidature (modifiable)</label>
                <textarea
                  className="input"
                  rows={6}
                  value={draft.messageText}
                  onChange={(e) => updateMessage(draft.id, e.target.value)}
                  onBlur={() => handleSaveMessage(draft.id)}
                />
                {savingId === draft.id && <p className="text-xs text-slate-400 mt-1">Enregistrement...</p>}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <a
                  className="btn-secondary text-sm"
                  href={`/api/cv-versions/${draft.cvVersionId}/download?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Previsualiser le CV
                </a>
                <a className="btn-secondary text-sm" href={`/api/cv-versions/${draft.cvVersionId}/download`}>
                  Telecharger le CV adapte
                </a>

                {draft.applyChannel === "EMAIL" ? (
                  <button
                    className="btn-primary text-sm"
                    onClick={() => handleSend(draft.id)}
                    disabled={sendingId === draft.id || !gmailConnected}
                    title={!gmailConnected ? "Connecte Gmail depuis la page Integrations pour envoyer par email." : undefined}
                  >
                    {sendingId === draft.id ? "Envoi..." : "Envoyer par email"}
                  </button>
                ) : (
                  <>
                    <a
                      className="btn-secondary text-sm"
                      href={draft.applyTarget}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ouvrir l&apos;offre ↗
                    </a>
                    <button className="btn-primary text-sm" onClick={() => handleSend(draft.id)} disabled={sendingId === draft.id}>
                      {sendingId === draft.id ? "..." : "Marquer comme envoyee"}
                    </button>
                  </>
                )}

                <button className="btn-danger text-sm ml-auto" onClick={() => handleDismiss(draft.id)}>
                  Ignorer
                </button>
              </div>

              {!gmailConnected && draft.applyChannel === "EMAIL" && (
                <p className="text-xs text-amber-700">
                  Compte Gmail non connecte : connecte-le depuis la page{" "}
                  <Link href="/integrations" className="underline">
                    Integrations
                  </Link>{" "}
                  pour pouvoir envoyer cette candidature.
                </p>
              )}
              {errorById[draft.id] && <p className="text-sm text-red-600">{errorById[draft.id]}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
