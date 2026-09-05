"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  onFinalized: (searchDescription: string, educationAdditions: string[]) => void;
};

// Widget flottant (bulle + panneau), volontairement rendu en dehors du
// <form> de la page Criteres : un <form> imbrique y ferait remonter
// l'evenement "submit" au formulaire parent (rechargement de page, perte
// de l'etat local du chat).
export default function SearchProfileChat({ onFinalized }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (open && messages.length === 0) {
      void sendTurn([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendTurn(nextMessages: ChatMessage[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue.");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Impossible de contacter l'assistant (probleme reseau).");
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    void sendTurn(nextMessages);
  }

  async function handleFinalize() {
    if (messages.length === 0) return;
    setFinalizing(true);
    setError(null);
    setDoneMsg(null);
    try {
      const res = await fetch("/api/search-chat/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue.");
        return;
      }
      onFinalized(data.searchDescription, data.educationAdditions ?? []);
      const extra =
        data.educationAdditions?.length > 0
          ? ` ${data.educationAdditions.length} info(s) sur ta formation ajoutee(s) a ton profil.`
          : "";
      setDoneMsg(`Description de recherche mise à jour.${extra}`);
      setOpen(false);
    } catch {
      setError("Impossible de contacter l'assistant (probleme reseau).");
    } finally {
      setFinalizing(false);
    }
  }

  return (
    <>
      {/* Bulle flottante */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          {doneMsg && (
            <div className="max-w-xs rounded-lg bg-white border border-green-200 shadow-lg px-3 py-2 text-sm text-green-700">
              {doneMsg}
            </div>
          )}
          <button
            type="button"
            aria-label="Discuter avec l'IA pour préciser ma recherche"
            title="Discuter avec l'IA pour préciser ma recherche"
            className="h-14 w-14 rounded-full bg-brand-600 text-white shadow-lg hover:bg-brand-700 text-2xl flex items-center justify-center transition-transform hover:scale-105"
            onClick={() => {
              setDoneMsg(null);
              setOpen(true);
            }}
          >
            💬
          </button>
        </div>
      )}

      {/* Panneau de discussion */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-3rem)] bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-brand-600 text-white shrink-0">
            <span className="font-medium text-sm">Précise ce que tu recherches</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white text-lg leading-none"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 min-h-[240px]">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-brand-600 text-white" : "bg-white border border-slate-200 text-slate-800"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <p className="text-xs text-slate-400">L&apos;assistant réfléchit...</p>}
            <div ref={bottomRef} />
          </div>

          {error && <p className="text-sm text-red-700 px-3 pt-2 shrink-0">{error}</p>}

          <div className="flex gap-2 p-3 border-t border-slate-200 bg-white shrink-0">
            <input
              className="input"
              placeholder="Ta réponse..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={loading}
              autoFocus
            />
            <button type="button" className="btn-primary" onClick={handleSend} disabled={loading || !input.trim()}>
              Envoyer
            </button>
          </div>

          <div className="p-3 border-t border-slate-200 bg-white shrink-0">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={handleFinalize}
              disabled={finalizing || messages.length === 0}
            >
              {finalizing ? "Mise à jour..." : "Terminer la discussion"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
