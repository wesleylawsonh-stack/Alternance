"use client";

import { useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  onFinalized: (searchDescription: string, educationAdditions: string[]) => void;
};

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

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
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
      setDoneMsg(`Description de recherche mise a jour.${extra}`);
      setOpen(false);
    } catch {
      setError("Impossible de contacter l'assistant (probleme reseau).");
    } finally {
      setFinalizing(false);
    }
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setMessages([]);
            setDoneMsg(null);
            setOpen(true);
          }}
        >
          💬 Discuter avec l&apos;IA pour préciser ma recherche
        </button>
        {doneMsg && <p className="text-sm text-green-700">{doneMsg}</p>}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="max-h-80 overflow-y-auto p-3 space-y-2 bg-slate-50">
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

      {error && <p className="text-sm text-red-700 px-3 pt-2">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2 p-3 border-t border-slate-200 bg-white">
        <input
          className="input"
          placeholder="Ta réponse..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          Envoyer
        </button>
      </form>

      <div className="flex items-center gap-3 p-3 border-t border-slate-200 bg-white">
        <button
          type="button"
          className="btn-primary"
          onClick={handleFinalize}
          disabled={finalizing || messages.length === 0}
        >
          {finalizing ? "Mise à jour..." : "Terminer la discussion"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
    </div>
  );
}
