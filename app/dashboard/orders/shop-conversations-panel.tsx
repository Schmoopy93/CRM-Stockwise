"use client";

import { MessageCircle, PackageCheck, Trash2 } from "lucide-react";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import OrderConversation from "@/components/OrderConversation";
import type { ShopConversation } from "@/lib/types";
import styles from "./orders.module.css";

interface Props {
  shopId: string;
  conversations: ShopConversation[];
  loading: boolean;
  error: Error | null;
  actionError: string;
  openIds: Set<string>;
  authorName: string;
  onToggle: (key: string) => void;
  onRequestHide: (conversationId: string) => void;
}

export default function ShopConversationsPanel({
  shopId,
  conversations,
  loading,
  error,
  actionError,
  openIds,
  authorName,
  onToggle,
  onRequestHide,
}: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];

  return (
    <section aria-label={t("chat.shopConversations")} className={`glass ${styles.panel}`}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>
            <span className={styles.panelIcon} aria-hidden="true">
              <MessageCircle size={15} />
            </span>
            {t("chat.shopConversations")}
          </h2>
          <p className={styles.panelDesc}>{t("chat.shopConversationsDescription")}</p>
        </div>
        <span className={styles.countPill}>
          {loading ? "—" : conversations.length.toLocaleString(intl)}
        </span>
      </div>

      {error && <p role="alert" className={styles.panelError}>{translateError(error, t, "orders.loadFailed")}</p>}
      {actionError && <p role="alert" className={styles.panelError}>{actionError}</p>}

      {!loading && conversations.length === 0 ? (
        <p className={styles.panelEmpty}>{t("chat.noShopConversations")}</p>
      ) : conversations.map((conversation) => {
        const key = `conversation-${conversation.id}`;
        const isOpen = openIds.has(key);
        return (
          <article key={conversation.id} id={key} className={styles.thread}>
            <div className={styles.threadTop}>
              <div className={styles.threadInfo}>
                <p className={styles.threadEmail}>{conversation.customerEmail}</p>
                {conversation.productName && (
                  <p className={styles.threadProduct}>
                    <PackageCheck size={13} /> {t("chat.productInQuestion")}: {conversation.productName}
                  </p>
                )}
                <time dateTime={conversation.createdAt?.toISOString()} className={styles.threadTime}>
                  {conversation.createdAt?.toLocaleString(intl) ?? "—"}
                </time>
              </div>
              <div className={styles.threadActions}>
                <button
                  type="button"
                  className={`${isOpen ? "btn-secondary" : "btn-primary"} ${styles.threadToggle}`}
                  onClick={() => onToggle(key)}
                >
                  <MessageCircle size={14} /> {t(isOpen ? "chat.closeConversation" : "chat.openConversation")}
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onRequestHide(conversation.id)}
                  aria-label={t("chat.deleteConversation")}
                  title={t("chat.deleteConversation")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {isOpen && (
              <OrderConversation
                shopId={shopId}
                conversationId={conversation.id}
                authorRole="shop"
                authorName={authorName}
                customerEmail={conversation.customerEmail}
                locale={locale}
              />
            )}
          </article>
        );
      })}
    </section>
  );
}
