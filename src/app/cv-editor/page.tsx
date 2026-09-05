"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Proposal = {
  id: string;
  section: "HEADLINE" | "SUMMARY" | "EXPERIENCE" | "SKILLS";
  label: string;
  original: string;
  proposed: string;
  rationale: string | null;
};

type Decision = {
  action: "accept" | "reject";
  editedText?: string;
};

type CvScore = {
  overall: number;
  categories: Record<"impact" | "lisibilite" | "adequation" | "ats" | "competences" | "experiences", number>;
  findings: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  impact: "Impact",
  lisibilite: "Lisibilite",
  adequation: "Adequation avec tes postes recherches",
  ats: "Compatibilite ATS",
  competences: "Competences",
  experiences: "Experiences",
};

export default function CvEditorPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Chargement...</p>}>
      <CvEditorContent />
    </Suspense>
  );
}

function CvEditorContent() {
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offerId");
  const optimize = searchParams.get("optimize") === "1";

  const [phase, setPhase] = useState<"score" | "edit">(offerId ? "edit" : "score");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [score, setScore] = useState<CvScore | null>(null);
  const [scoreUsedAi, setScoreUsedAi] = useState(false);
  const [scoreAiError, setScoreAiError] = useState<string | null>(null);

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [usedAi, setUsedAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [offerInfo, setOfferInfo] = useState<{ id: string; title: string; company: string | null; url: string | null } | null>(
    null
  );
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [result, setResult] = useState<{ id: string; label: string } | null>(null);

  const [applicationMessage, setApplicationMessage] = useState<string | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [messageUsedAi, setMessageUsedAi] = useState(false);
  const [messageAiError, setMessageAiError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (offerId) {
      loadProposals();
    } else {
      loadScore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  function loadScore() {
    setLoading(true);
    setError(null);
    fetch("/api/cv/score", { method: "POST" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Erreur lors de l'analyse du CV.");
        setScore(data.score);
        setScoreUsedAi(data.usedAi);
        setScoreAiError(data.aiError ?? null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function loadProposals() {
    setLoading(true);
    setError(null);
    fetch("/api/cv/propose-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: offerId || undefined }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Erreur lors de l'analyse du CV.");
        setProposals(data.proposals);
        setUsedAi(data.usedAi);
        setAiError(data.aiError ?? null);
        setOfferInfo(data.offer);
        const initialDecisions: Record<string, Decision> = {};
        for (const p of data.proposals as Proposal[]) {
          initialDecisions[p.id] = { action: "accept" };
        }
        setDecisions(initialDecisions);
        setPhase("edit");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function setDecision(id: string, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [id]: decision }));
  }

  async function handleFinalize() {
    setFinalizing(true);
    setError(null);
    try {
      const res = await fetch("/api/cv/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: offerId || undefined,
          proposals,
          decisions: Object.entries(decisions).map(([id, d]) => ({ id, ...d })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la generation du CV.");
      setResult(data.version);

      if (optimize && offerId) {
        setMessageLoading(true);
        try {
          const msgRes = await fetch("/api/cv/application-message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offerId }),
          });
          const msgData = await msgRes.json();
          if (msgRes.ok) {
            setApplicationMessage(msgData.message);
            setMessageUsedAi(msgData.usedAi);
            setMessageAiError(msgData.aiError ?? null);
          }
        } catch {
          // Le message de candidature est un bonus : une erreur ici ne doit
          // pas bloquer l'affichage du CV genere avec succes.
        } finally {
          setMessageLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleApply() {
    if (!offerId) return;
    setApplied(true);
    await fetch(`/api/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationStatus: "APPLIED" }),
    });
  }

  if (loading) return <p className="text-slate-500">Analyse du CV en cours...</p>;

  if (result) {
    return (
      <div className="space-y-6">
        <div className="card p-6 text-center space-y-4">
          <h1 className="text-xl font-semibold text-slate-900">CV genere : {result.label}</h1>
          <div className="flex justify-center gap-3">
            <a className="btn-primary" href={`/api/cv-versions/${result.id}/download`}>
              Telecharger le PDF
            </a>
            <Link className="btn-secondary" href="/cv-history">
              Voir dans Mes CV
            </Link>
          </div>
        </div>

        {optimize && offerId && (
          <div className="card p-6 space-y-4">
            <div>
              <h2 className="font-medium text-slate-900">Message de candidature propose</h2>
              <p className="text-sm text-slate-500 mt-1">
                Base sur ton CV et cette offre, sans rien inventer. Relis-le et modifie-le avant de l&apos;utiliser.
              </p>
            </div>

            {messageLoading ? (
              <p className="text-sm text-slate-500">Generation du message...</p>
            ) : applicationMessage !== null ? (
              <>
                {!messageUsedAi && messageAiError && (
                  <p className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
                    L&apos;appel a l&apos;IA a echoue, message compose a partir d&apos;un modele simple a la place.
                    Erreur : {messageAiError}
                  </p>
                )}
                {!messageUsedAi && !messageAiError && (
                  <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2">
                    Aucune cle IA configuree : message compose a partir d&apos;un modele simple.
                  </p>
                )}
                <textarea
                  className="input text-sm"
                  rows={8}
                  value={applicationMessage}
                  onChange={(e) => setApplicationMessage(e.target.value)}
                />
              </>
            ) : (
              <p className="text-sm text-slate-400">Message de candidature indisponible.</p>
            )}

            <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-slate-100">
              {offerInfo?.url ? (
                <a
                  href={offerInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  onClick={handleApply}
                >
                  Postuler sur l&apos;offre ↗
                </a>
              ) : (
                <button className="btn-primary" onClick={handleApply} disabled={applied}>
                  Marquer comme postule
                </button>
              )}
              {applied && <span className="text-sm text-green-700">Statut de candidature mis a jour.</span>}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === "score" && score) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analyse de ton CV</h1>
          <p className="text-slate-500 mt-1">Evaluation de la redaction de ton CV (pas de ta valeur en tant que candidat).</p>
        </div>

        {error && <p className="card p-4 text-sm text-red-600">{error}</p>}

        {!scoreUsedAi && scoreAiError && (
          <p className="card p-4 text-sm text-red-700 bg-red-50">
            L&apos;appel a l&apos;IA a echoue, analyse basee sur des criteres objectifs simples a la place. Erreur :{" "}
            {scoreAiError}
          </p>
        )}
        {!scoreUsedAi && !scoreAiError && (
          <p className="card p-4 text-sm text-amber-800 bg-amber-50">
            Aucune cle IA configuree (ANTHROPIC_API_KEY) : l&apos;analyse ci-dessous est basee sur des criteres
            objectifs simples (verbes d&apos;action, chiffres, sections presentes...). Connecte une cle IA pour une
            analyse plus fine.
          </p>
        )}

        <div className="card p-6 text-center">
          <p className="text-5xl font-bold text-brand-700">{score.overall}</p>
          <p className="text-slate-500 mt-1">/ 100</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {Object.entries(score.categories).map(([key, value]) => (
            <div key={key} className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">{CATEGORY_LABELS[key] ?? key}</span>
                <span className="text-sm font-semibold text-slate-900">{value}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${value >= 70 ? "bg-green-500" : value >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {score.findings.length > 0 && (
          <div className="card p-6">
            <h2 className="font-medium text-slate-900 mb-3">Observations</h2>
            <ul className="space-y-2">
              {score.findings.map((f, i) => (
                <li key={i} className="text-sm text-slate-600 flex gap-2">
                  <span className="text-brand-600">•</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="btn-primary" onClick={loadProposals}>
          Creer une version amelioree
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Editeur de CV</h1>
        <p className="text-slate-500 mt-1">
          {offerInfo
            ? `Adaptation pour "${offerInfo.title}"${offerInfo.company ? ` chez ${offerInfo.company}` : ""}.`
            : "Amelioration generale de ton CV."}{" "}
          Relis chaque proposition avant de valider : rien n&apos;est modifie sans ton accord.
        </p>
      </div>

      {error && <p className="card p-4 text-sm text-red-600">{error}</p>}

      {!usedAi && aiError && (
        <p className="card p-4 text-sm text-red-700 bg-red-50">
          L&apos;appel a l&apos;IA a echoue, seul le reordonnancement des competences est propose a la place. Erreur :{" "}
          {aiError}
        </p>
      )}
      {!usedAi && !aiError && (
        <p className="card p-4 text-sm text-amber-800 bg-amber-50">
          Aucune cle IA configuree (ANTHROPIC_API_KEY) : seul le reordonnancement des competences en lien avec
          l&apos;offre est propose automatiquement. Connecte une cle IA pour des reformulations d&apos;accroche et
          d&apos;experiences.
        </p>
      )}

      {proposals.length === 0 ? (
        <p className="card p-6 text-center text-slate-500">
          Aucune amelioration proposee pour l&apos;instant. Tu peux tout de meme generer une version (identique a
          l&apos;original) pour la conserver dans &quot;Mes CV&quot;.
        </p>
      ) : (
        <div className="space-y-4">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              decision={decisions[p.id] ?? { action: "accept" }}
              editing={editingId === p.id}
              onEdit={() => setEditingId(p.id)}
              onStopEdit={() => setEditingId(null)}
              onDecide={(d) => setDecision(p.id, d)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={handleFinalize} disabled={finalizing}>
          {finalizing ? "Generation..." : "Valider et generer le CV"}
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  decision,
  editing,
  onEdit,
  onStopEdit,
  onDecide,
}: {
  proposal: Proposal;
  decision: Decision;
  editing: boolean;
  onEdit: () => void;
  onStopEdit: () => void;
  onDecide: (d: Decision) => void;
}) {
  const displayedProposed = decision.editedText ?? proposal.proposed;
  const isRejected = decision.action === "reject";

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-slate-900">{proposal.label}</h3>
        <div className="flex gap-1.5">
          <button
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              decision.action === "accept" && !editing ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => {
              onStopEdit();
              onDecide({ action: "accept" });
            }}
          >
            Accepter
          </button>
          <button
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              editing ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
            onClick={onEdit}
          >
            Modifier
          </button>
          <button
            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              isRejected ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
            onClick={() => {
              onStopEdit();
              onDecide({ action: "reject" });
            }}
          >
            Refuser
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Version actuelle</p>
          <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">
            {proposal.original || <span className="text-slate-400">(vide)</span>}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1">Proposition IA</p>
          {editing ? (
            <textarea
              className="input text-sm"
              rows={4}
              defaultValue={displayedProposed}
              onChange={(e) => onDecide({ action: "accept", editedText: e.target.value })}
              autoFocus
            />
          ) : (
            <p
              className={`text-sm rounded-lg p-3 whitespace-pre-wrap ${
                isRejected ? "bg-slate-50 text-slate-400 line-through" : "bg-green-50 text-green-900"
              }`}
            >
              {displayedProposed}
            </p>
          )}
        </div>
      </div>

      {proposal.rationale && !isRejected && (
        <p className="text-xs text-slate-400 italic mt-2">{proposal.rationale}</p>
      )}
    </div>
  );
}
