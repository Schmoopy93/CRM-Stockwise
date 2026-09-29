"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useI18n } from "@/lib/i18n-context";
import { MessageCircleQuestion, Send, Sparkles, X } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function LoginAskAi() {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** Grows the textarea with its content up to the CSS max-height, then scrolls. */
  function autoGrow(e: ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    setInput(el.value);
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, error, open]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    const history: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(history);
    setInput("");
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Locale": locale },
        body: JSON.stringify({ messages: history, locale }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("answer" in result) || typeof result.answer !== "string") {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : t("login.ask.error");
        setError(message);
        return;
      }
      setMessages([...history, { role: "assistant", content: result.answer }]);
    } catch {
      setError(t("login.ask.error"));
    } finally {
      setLoading(false);
    }
  }

  const bubbleBase = { maxWidth: "85%", padding: "0.6rem 0.85rem", fontSize: "0.82rem", lineHeight: 1.6, whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const };

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label={t("login.ask.title")}
          className="ask-ai-panel"
          style={{ position: "fixed", right: 16, bottom: 80, zIndex: 40, width: "min(360px, calc(100vw - 32px))", height: "min(480px, calc(100dvh - 120px))", display: "flex", flexDirection: "column", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 18, boxShadow: "0 20px 60px rgba(0,0,0,0.45)", overflow: "hidden", animation: "slideUp 0.2s ease" }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0.85rem 1rem", borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, rgba(99,102,241,0.14), rgba(168,85,247,0.1))", flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(135deg, #6366f1, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(99,102,241,0.4)", flexShrink: 0 }}>
              <Sparkles size={15} color="white" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: "0.84rem", fontWeight: 800, color: "var(--text-1)" }}>{t("login.ask.title")}</p>
              <p style={{ margin: 0, fontSize: "0.68rem", color: "var(--text-3)" }}>{t("login.ask.subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("login.ask.close")}
              style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", color: "var(--text-3)", flexShrink: 0 }}
            >
              <X size={13} />
            </button>
          </div>

          {/* Messages */}
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "0.9rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div style={{ ...bubbleBase, alignSelf: "flex-start", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "14px 14px 14px 4px", color: "var(--text-2)" }}>
              {t("login.ask.welcome")}
            </div>
            {messages.map((message, index) => (
              <div
                key={index}
                style={message.role === "user"
                  ? { ...bubbleBase, alignSelf: "flex-end", background: "linear-gradient(135deg, #6366f1, #4f52d9)", borderRadius: "14px 14px 4px 14px", color: "white" }
                  : { ...bubbleBase, alignSelf: "flex-start", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "14px 14px 14px 4px", color: "var(--text-1)" }}
              >
                {message.content}
              </div>
            ))}
            {loading && (
              <div style={{ ...bubbleBase, alignSelf: "flex-start", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: "14px 14px 14px 4px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: 7 }}>
                <Sparkles size={13} className="spin" color="#a855f7" /> {t("login.ask.thinking")}
              </div>
            )}
            {error && (
              <p role="alert" style={{ margin: 0, alignSelf: "center", fontSize: "0.74rem", color: "var(--red)", textAlign: "center", lineHeight: 1.5 }}>{error}</p>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            style={{ display: "flex", gap: 7, alignItems: "flex-end", padding: "0.75rem", borderTop: "1px solid var(--border)", background: "var(--bg-2)", flexShrink: 0 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {input.length === 0 && (
                <p style={{ margin: "0 0 6px", fontSize: "0.68rem", lineHeight: 1.35, color: "var(--text-3)" }}>{t("login.ask.hint")}</p>
              )}
              <textarea
                ref={inputRef}
                className="input"
                rows={1}
                value={input}
                maxLength={400}
                placeholder={t("login.ask.placeholder")}
                onChange={autoGrow}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                aria-label={t("login.ask.placeholder")}
                autoFocus
                style={{ flex: 1, fontSize: "0.82rem", resize: "none", overflowY: "hidden", minHeight: 40, maxHeight: 120 }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label={t("login.ask.button")}
              className="btn-primary"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, padding: 0, borderRadius: 11, flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1, cursor: loading ? "wait" : "pointer" }}
            >
              {loading ? <Sparkles size={15} className="spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}

      {/* Floating toggle */}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t("login.ask.title")}
        aria-expanded={open}
        className="ask-ai-fab"
        style={{ position: "fixed", right: 16, bottom: 16, zIndex: 41, width: 52, height: 52, borderRadius: 16, border: "none", background: "linear-gradient(135deg, #6366f1, #a855f7)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 6px 24px rgba(99,102,241,0.5)", transition: "transform 0.18s, box-shadow 0.18s" }}
        onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 10px 32px rgba(99,102,241,0.65)"; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "none"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 24px rgba(99,102,241,0.5)"; }}
      >
        {open ? <X size={22} /> : <MessageCircleQuestion size={24} />}
      </button>
    </>
  );
}
