"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { Send } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { Locale, INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { markOrderMessagesRead, markShopConversationRead } from "@/lib/notifications";

interface ConversationMessage {
  id: string;
  authorUid: string;
  authorRole: "customer" | "shop";
  authorName: string;
  text: string;
  createdAt: Date | null;
}

export default function OrderConversation({
  shopId,
  orderId,
  conversationId,
  authorRole,
  authorName,
  customerEmail,
  locale,
}: {
  shopId: string;
  orderId?: string;
  conversationId?: string;
  authorRole: ConversationMessage["authorRole"];
  authorName: string;
  customerEmail?: string;
  locale: Locale;
}) {
  const { t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const threadId = conversationId ?? orderId ?? "";
  const messagesCollection = useMemo(() => conversationId
    ? collection(db, "shops", shopId, "conversations", conversationId, "messages")
    : collection(db, "shops", shopId, "orders", orderId ?? "", "messages"), [shopId, conversationId, orderId]);

  useEffect(() => {
    const messagesQuery = query(
      messagesCollection,
      orderBy("createdAt", "desc"),
      limit(100)
    );
    return onSnapshot(messagesQuery, (snapshot) => {
      const nextMessages = snapshot.docs.map((message) => ({
        id: message.id,
        authorUid: message.data().authorUid ?? "",
        authorRole: message.data().authorRole === "shop" ? "shop" as const : "customer" as const,
        authorName: message.data().authorName ?? "",
        text: message.data().text ?? "",
        createdAt: message.data().createdAt?.toDate() ?? null,
      })).reverse();
      setMessages(nextMessages);
      if (authorRole === "shop") {
        const latestMessage = nextMessages.at(-1);
        if (latestMessage) {
          if (conversationId) markShopConversationRead(shopId, conversationId, latestMessage.id);
          else markOrderMessagesRead(shopId, threadId, latestMessage.id);
        }
      }
      setLoading(false);
      setError("");
    }, (cause) => {
      console.error("Failed to load order conversation", cause);
      setError(translateError(cause, t, "chat.loadFailed"));
      setLoading(false);
    });
  }, [shopId, threadId, conversationId, messagesCollection, authorRole, t]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = text.trim();
    const user = auth.currentUser;
    if (!body || body.length > 2000 || !user || sending) return;

    setSending(true);
    setError("");
    try {
      await addDoc(messagesCollection, {
        authorUid: user.uid,
        authorRole,
        authorName: authorRole === "customer"
          ? (user.email ?? "").slice(0, 100)
          : authorName.trim().slice(0, 100) || user.email || t("chat.participant"),
        text: body,
        createdAt: serverTimestamp(),
      });
      setText("");
    } catch (cause) {
      setError(translateError(cause, t, "chat.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-label={t("chat.title")} style={{
      display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0,
      border: "1px solid var(--border)", borderRadius: 12, padding: "0.85rem",
      background: "var(--bg-2)",
    }}>
      <h3 style={{ margin: 0, color: "var(--text-1)", fontSize: "0.85rem", fontWeight: 750 }}>
        {t("chat.title")}
      </h3>
      <div aria-live="polite" style={{
        display: "flex", flexDirection: "column", gap: "0.55rem", minHeight: 56,
        maxHeight: 320, overflowY: "auto", padding: "0.1rem",
      }}>
        {loading ? (
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.78rem" }}>{t("loading")}</p>
        ) : messages.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.78rem" }}>{t("chat.empty")}</p>
        ) : messages.map((message) => {
          const mine = message.authorUid === auth.currentUser?.uid;
          return (
            <article key={message.id} style={{
              alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "88%",
              borderRadius: mine ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              padding: "0.55rem 0.7rem",
              background: mine ? "var(--accent-glow)" : "var(--bg-3)",
            }}>
              <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.66rem", fontWeight: 700 }}>
                {message.authorRole === "customer" ? customerEmail || message.authorName : message.authorName}
                {message.createdAt && (
                  <time dateTime={message.createdAt.toISOString()} style={{ marginLeft: 7, fontWeight: 500 }}>
                    {message.createdAt.toLocaleString(intl)}
                  </time>
                )}
              </p>
              <p style={{ margin: "0.25rem 0 0", color: "var(--text-1)", fontSize: "0.8rem", lineHeight: 1.45, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {message.text}
              </p>
            </article>
          );
        })}
      </div>
      {error && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.76rem" }}>{error}</p>}
      <form onSubmit={send} style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
        <textarea
          className="input"
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 2000))}
          placeholder={t("chat.messagePlaceholder")}
          aria-label={t("chat.messagePlaceholder")}
          rows={2}
          maxLength={2000}
          required
          style={{ flex: 1, minWidth: 0, resize: "vertical", fontSize: "0.8rem" }}
        />
        <button
          type="submit"
          className="btn-primary"
          disabled={sending || !text.trim()}
          aria-label={t("chat.send")}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, padding: "0.5rem 0.7rem", fontSize: "0.76rem" }}
        >
          <Send size={14} />
          {t("chat.send")}
        </button>
      </form>
    </section>
  );
}
