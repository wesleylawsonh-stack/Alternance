"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Skeleton, { SkeletonForm } from "@/components/Skeleton";

type GmailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<SkeletonForm fields={2} />}>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  // On garde l'objet criteres complet (pas seulement le booleen du digest) :
  // l'API PUT /api/criteria remplace toutes les valeurs envoyees, un objet
  // partiel ecraserait silencieusement les autres criteres deja enregistres.
  const [criteria, setCriteria] = useState<Record<string, unknown> | null>(null);
  const [savingDigest, setSavingDigest] = useState(false);

  function load() {
    fetch("/api/gmail/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      });
    fetch("/api/criteria")
      .then((r) => r.json())
      .then((data) => setCriteria(data.criteria ?? {}));
  }

  useEffect(load, []);

  async function handleDigestToggle(enabled: boolean) {
    if (!criteria) return;
    setSavingDigest(true);
    const next = { ...criteria, emailDigestEnabled: enabled };
    setCriteria(next);
    await fetch("/api/criteria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSavingDigest(false);
  }

  const gmailConnectedParam = searchParams.get("gmail_connected");
  const gmailErrorParam = searchParams.get("gmail_error");

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    setSyncError(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Erreur lors de la synchronisation.");
      } else {
        setSyncMsg(
          `${data.scanned} email(s) analyse(s), ${data.matched} associe(s) a une candidature, ${data.updated} statut(s) mis a jour.`
        );
        load();
      }
    } catch {
      setSyncError("Erreur reseau.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Deconnecter ton compte Gmail ? La synchronisation automatique s'arretera.")) return;
    await fetch("/api/gmail/disconnect", { method: "POST" });
    load();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-40 mb-2" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <SkeletonForm fields={2} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Integrations</h1>
        <p className="text-slate-500 mt-1">Connecte ta boite Gmail pour mettre a jour automatiquement le statut de tes candidatures.</p>
      </div>

      {gmailConnectedParam && (
        <p className="card p-3 text-sm text-green-700">Compte Gmail connecte avec succes.</p>
      )}
      {gmailErrorParam && (
        <p className="card p-3 text-sm text-red-600">Erreur de connexion Gmail : {gmailErrorParam}</p>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-medium mb-2">Gmail</h2>
        <p className="text-sm text-slate-500 mb-4">
          Acces en lecture seule a ta boite mail. Le site cherche, parmi les emails recus, ceux qui correspondent a
          une offre pour laquelle tu as deja postule (par nom d&apos;entreprise / intitule de poste), puis detecte
          automatiquement les refus, propositions d&apos;entretien et offres d&apos;embauche pour mettre a jour le
          statut de candidature (journalise dans les commentaires de l&apos;offre concernee).
        </p>

        {!status?.configured && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            L&apos;integration Gmail n&apos;est pas encore configuree. Ajoute <code>GOOGLE_CLIENT_ID</code>,{" "}
            <code>GOOGLE_CLIENT_SECRET</code> et <code>GOOGLE_REDIRECT_URI</code> dans <code>.env</code> (voir le
            README pour la procedure Google Cloud pas-a-pas), puis redemarre le serveur.
          </div>
        )}

        {status?.configured && !status.connected && (
          <a className="btn-primary" href="/api/gmail/auth">
            Connecter Gmail
          </a>
        )}

        {status?.connected && (
          <div className="space-y-4">
            <div className="text-sm text-slate-700">
              <p>
                Connecte en tant que <span className="font-medium">{status.email}</span>
              </p>
              <p className="text-slate-500 mt-1">
                Derniere synchronisation :{" "}
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("fr-FR") : "jamais"}
              </p>
              {status.lastSyncError && (
                <p className="text-red-600 mt-1">Derniere erreur : {status.lastSyncError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={handleSync} disabled={syncing}>
                {syncing ? "Synchronisation..." : "Synchroniser maintenant"}
              </button>
              <button className="btn-danger" onClick={handleDisconnect}>
                Deconnecter
              </button>
            </div>
            {syncMsg && <p className="text-sm text-green-700">{syncMsg}</p>}
            {syncError && <p className="text-sm text-red-600">{syncError}</p>}

            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(criteria?.emailDigestEnabled)}
                  disabled={savingDigest || !criteria}
                  onChange={(e) => handleDigestToggle(e.target.checked)}
                />
                <span className="text-sm text-slate-700">
                  Recevoir un email (via Gmail) apres chaque recuperation automatique listant les nouvelles offres a
                  fort potentiel
                </span>
              </label>
              <p className="text-xs text-slate-400 mt-1">
                Necessite la permission d&apos;envoi Gmail. Si tu as connecte Gmail avant l&apos;ajout de cette
                fonctionnalite, deconnecte puis reconnecte ton compte pour l&apos;accorder (Google ne l&apos;ajoute
                pas retroactivement a une connexion existante).
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-medium mb-2">Synchronisation automatique en arriere-plan</h2>
        <p className="text-sm text-slate-500">
          Le bouton ci-dessus lance une synchronisation immediate. Pour que ca se fasse tout seul, sans y penser, il
          faut que le site tourne en continu quelque part (le point d&apos;entree <code>/api/gmail/sync</code> est
          deja pret pour ca) et que tu branches une tache planifiee dessus. Voir la section &quot;Synchronisation
          automatique&quot; du README pour les options (Vercel Cron, cron systeme sur un serveur, GitHub Actions
          planifie...).
        </p>
      </section>
    </div>
  );
}
