"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { MessageCircle, Send } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { Locale, INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { markOrderMessagesRead, markShopConversationRead } from "@/lib/notifications";
import styles from "./order-conversation.module.css";

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
  fill,
}: {
  shopId: string;
  orderId?: string;
  conversationId?: string;
  authorRole: ConversationMessage["authorRole"];
  authorName: string;
  customerEmail?: string;
  locale: Locale;
  /** Stretch to the host's height instead of capping the thread at 320px. */
  fill?: boolean;
}) {
  const { t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

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
    <section aria-label={t("chat.title")} className={`${styles.chat} ${fill ? styles.fill : ""}`}>
      <header className={styles.head}>
        <span className={styles.headIcon} aria-hidden="true">
          <MessageCircle size={13} />
        </span>
        <h3 className={styles.title}>{t("chat.title")}</h3>
      </header>
      <div aria-live="polite" className={styles.messages} ref={listRef}>
        {loading ? (
          <p className={styles.note}>{t("loading")}</p>
        ) : messages.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <MessageCircle size={16} />
            </span>
            <p className={styles.note}>{t("chat.empty")}</p>
          </div>
        ) : messages.map((message) => {
          const mine = message.authorUid === auth.currentUser?.uid;
          const sender = message.authorRole === "customer" ? customerEmail || message.authorName : message.authorName;
          return (
            <article key={message.id} className={styles.row} data-mine={mine || undefined}>
              {!mine && (
                <span className={styles.avatar} aria-hidden="true">
                  {(sender.trim()[0] ?? "?").toUpperCase()}
                </span>
              )}
              <div className={styles.bubble} data-mine={mine || undefined}>
                <p className={styles.meta}>
                  {sender}
                  {message.createdAt && (
                    <time dateTime={message.createdAt.toISOString()} className={styles.time}>
                      {message.createdAt.toLocaleString(intl)}
                    </time>
                  )}
                </p>
                <p className={styles.text}>{message.text}</p>
              </div>
            </article>
          );
        })}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <form onSubmit={send} className={styles.composer}>
        <textarea
          className={`input ${styles.input}`}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, 2000))}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder={t("chat.messagePlaceholder")}
          aria-label={t("chat.messagePlaceholder")}
          rows={2}
          maxLength={2000}
          required
        />
        <button
          type="submit"
          className={`btn-primary ${styles.send}`}
          disabled={sending || !text.trim()}
          aria-label={t("chat.send")}
          title={t("chat.send")}
        >
          <Send size={15} />
        </button>
      </form>
    </section>
  );
}
