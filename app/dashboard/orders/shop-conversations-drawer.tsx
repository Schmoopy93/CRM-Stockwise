"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowUpRight, ChevronRight, MessageCircle, PackageCheck, Trash2, X } from "lucide-react";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { useProduct } from "@/lib/hooks";
import OrderConversation from "@/components/OrderConversation";
import { useDialogFocus } from "@/components/use-dialog-focus";
import type { ShopConversation } from "@/lib/types";
import styles from "./orders.module.css";

const CLOSE_MS = 240;
const SWIPE_CLOSE_PX = 90;

interface Props {
  shopId: string;
  conversations: ShopConversation[];
  loading: boolean;
  error: Error | null;
  actionError: string;
  activeId: string | null;
  authorName: string;
  onSelect: (conversationId: string | null) => void;
  onClose: () => void;
  onRequestHide: (conversationId: string) => void;
}

function initialOf(value: string) {
  const clean = value.trim();
  return clean ? clean[0].toUpperCase() : "?";
}

/** Pre-order buyer messages, kept off the orders page itself: the header button
 * opens this sheet, the list picks a thread, and the thread keeps the composer
 * pinned while messages scroll. Mounted only while open so the dialog takes
 * focus on the very first render. */
export default function ShopConversationsDrawer({
  shopId,
  conversations,
  loading,
  error,
  actionError,
  activeId,
  authorName,
  onSelect,
  onClose,
  onRequestHide,
}: Props) {
  const { locale, t } = useI18n();
  const intl = INTL_LOCALES[locale];
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const { product } = useProduct(shopId, active?.productId);
  const productImage = product && product.id === active?.productId
    ? product.images[0] || product.imageUrl
    : "";
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragFrom = useRef<number | null>(null);
  const dragDistance = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    if (closeTimer.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [requestClose]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (closing || event.button !== 0) return;
    dragFrom.current = event.clientX;
    dragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragFrom.current === null) return;
    dragDistance.current = Math.max(0, event.clientX - dragFrom.current);
    setDragX(dragDistance.current);
  }

  function finishDrag() {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    setDragging(false);
    if (dragDistance.current > SWIPE_CLOSE_PX) {
      closeTimer.current = setTimeout(onClose, CLOSE_MS);
      setClosing(true);
      setDragX(0);
    } else {
      setDragX(0);
    }
  }

  if (typeof document === "undefined") return null;

  const backdropTint = closing || dragging
    ? `rgba(15, 23, 42, ${closing ? 0 : 0.55 * Math.max(0, 1 - dragX / 620)})`
    : undefined;

  return createPortal(
    <div
      className={styles.drawerBackdrop}
      data-dragging={dragging || undefined}
      data-closing={closing || undefined}
      style={backdropTint ? { backgroundColor: backdropTint } : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.shopConversations")}
        className={styles.drawer}
        style={closing ? { transform: "translateX(100%)" } : dragX ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        <div
          className={styles.drawerGrabber}
          aria-hidden="true"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        />
        <header className={styles.drawerHead}>
          <span className={styles.drawerIcon} aria-hidden="true">
            <MessageCircle size={15} />
          </span>
          <div className={styles.drawerHeading}>
            <h2 className={styles.drawerTitle}>{t("chat.shopConversations")}</h2>
            <p className={styles.drawerDesc}>{t("chat.shopConversationsDescription")}</p>
          </div>
          {!loading && <span className={styles.countPill}>{conversations.length.toLocaleString(intl)}</span>}
          <button type="button" className={styles.drawerClose} onClick={requestClose} aria-label={t("catalog.close")}>
            <X size={15} />
          </button>
        </header>

        <div className={styles.drawerBody} data-thread={active ? true : undefined}>
          {error && <p role="alert" className={styles.panelError}>{translateError(error, t, "orders.loadFailed")}</p>}
          {actionError && <p role="alert" className={styles.panelError}>{actionError}</p>}

          {active ? (
            <>
              <div className={styles.threadHead}>
                <div className={styles.threadTop}>
                  <button type="button" className={styles.threadBack} onClick={() => onSelect(null)}>
                    <ArrowLeft size={13} />
                    {t("back")}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => onRequestHide(active.id)}
                    aria-label={t("chat.deleteConversation")}
                    title={t("chat.deleteConversation")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className={styles.threadIdentity}>
                  <span className={styles.threadAvatar} aria-hidden="true">
                    {initialOf(active.customerEmail)}
                  </span>
                  <div className={styles.threadWho}>
                    <p className={styles.threadEmail}>{active.customerEmail}</p>
                    <time dateTime={active.createdAt?.toISOString()} className={styles.threadTime}>
                      {active.createdAt?.toLocaleString(intl) ?? "—"}
                    </time>
                  </div>
                </div>
                {active.productName && (active.productId ? (
                  <Link href={`/dashboard/products/${active.productId}`} className={styles.threadProductLink}>
                    <span className={styles.threadProductThumb}>
                      {productImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={productImage} alt="" />
                      ) : (
                        <PackageCheck size={16} />
                      )}
                    </span>
                    <span className={styles.threadProductBody}>
                      <span className={styles.threadProductLabel}>{t("chat.productInQuestion")}</span>
                      <span className={styles.threadProductName}>{active.productName}</span>
                    </span>
                    <ArrowUpRight size={15} className={styles.threadProductOpen} aria-hidden="true" />
                  </Link>
                ) : (
                  <p className={styles.threadProduct}>
                    <PackageCheck size={13} /> {active.productName}
                  </p>
                ))}
              </div>
              <div className={styles.threadChat}>
                <OrderConversation
                  shopId={shopId}
                  conversationId={active.id}
                  authorRole="shop"
                  authorName={authorName}
                  customerEmail={active.customerEmail}
                  locale={locale}
                  fill
                />
              </div>
            </>
          ) : loading ? (
            <p className={styles.panelEmpty}>{t("loading")}</p>
          ) : conversations.length === 0 ? (
            <div className={styles.drawerEmpty}>
              <span className={styles.emptyIcon}><MessageCircle size={18} /></span>
              <p className={styles.emptyTitle}>{t("chat.noShopConversations")}</p>
            </div>
          ) : conversations.map((conversation) => (
            <div key={conversation.id} className={styles.convRow}>
              <button type="button" className={styles.convOpen} onClick={() => onSelect(conversation.id)}>
                <span className={styles.convAvatar} aria-hidden="true">{initialOf(conversation.customerEmail)}</span>
                <span className={styles.convText}>
                  <span className={styles.convEmail}>{conversation.customerEmail}</span>
                  {conversation.productName && (
                    <span className={styles.convProduct}>
                      <PackageCheck size={12} /> {conversation.productName}
                    </span>
                  )}
                  <span className={styles.convTime}>
                    {conversation.createdAt?.toLocaleString(intl) ?? "—"}
                  </span>
                </span>
                <ChevronRight size={15} className={styles.convChevron} aria-hidden="true" />
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
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
