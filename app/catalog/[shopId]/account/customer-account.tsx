"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { ArrowLeft, LogOut, Mail, MessageCircle, Package, Trash2 } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CatalogOrder, OrderStatus } from "@/lib/types";
import { formatCatalogPrice } from "@/lib/catalog-channels";
import { BASE_CURRENCY } from "@/lib/currency";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import OrderConversation from "@/components/OrderConversation";

const emailStorageKey = (shopId: string) => `catalog-account-email-${shopId}`;
const productStorageKey = (shopId: string) => `catalog-account-product-${shopId}`;

interface ShopConversation {
  id: string;
  customerEmail: string;
  productName?: string;
  hiddenByCustomer?: boolean;
  createdAt: Date | null;
}

interface ProductContext {
  id: string;
  name: string;
}

function requestedProductId() {
  const current = new URL(window.location.href);
  const productId = current.searchParams.get("productId");
  if (productId) return productId;
  const continueUrl = current.searchParams.get("continueUrl");
  if (!continueUrl) return "";
  try {
    return new URL(continueUrl).searchParams.get("productId") ?? "";
  } catch {
    return "";
  }
}

function preservedProductId(shopId: string) {
  const fromUrl = requestedProductId();
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(productStorageKey(shopId)) ?? "";
  } catch (cause) {
    console.error("Could not restore product context for customer chat", cause);
    return "";
  }
}

function readProductContextId(shopId: string) {
  const fromUrl = requestedProductId();
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(productStorageKey(shopId)) ?? "";
  } catch (cause) {
    console.error("Could not restore product context for customer chat", cause);
    return "";
  }
}

function emailLinkErrorKey(cause: unknown) {
  const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
    ? cause.code
    : "";
  switch (code) {
    case "auth/operation-not-allowed":
      return "chat.linkProviderDisabled";
    case "auth/unauthorized-continue-uri":
    case "auth/invalid-continue-uri":
      return "chat.linkDomainNotAllowed";
    case "auth/invalid-email":
      return "chat.linkInvalidEmail";
    case "auth/too-many-requests":
      return "chat.linkRateLimited";
    case "auth/network-request-failed":
      return "chat.linkNetworkFailed";
    default:
      return code ? `chat.linkUnknown:${code}` : "chat.linkFailed";
  }
}

function subscribeToLocationChange(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readSignInLinkState() {
  return typeof window !== "undefined" && isSignInWithEmailLink(auth, window.location.href);
}

function mapOrder(id: string, data: Record<string, unknown>): CatalogOrder {
  const timestamp = data.createdAt as { toDate?: () => Date } | undefined;
  return {
    id,
    code: typeof data.code === "string" ? data.code : "",
    lines: Array.isArray(data.lines) ? data.lines as CatalogOrder["lines"] : [],
    total: typeof data.total === "number" ? data.total : 0,
    currency: typeof data.currency === "string" ? data.currency : undefined,
    customerName: typeof data.customerName === "string" ? data.customerName : "",
    customerContact: typeof data.customerContact === "string" ? data.customerContact : "",
    customerEmail: typeof data.customerEmail === "string" ? data.customerEmail : "",
    customerAddress: typeof data.customerAddress === "string" ? data.customerAddress : "",
    customerCity: typeof data.customerCity === "string" ? data.customerCity : "",
    note: typeof data.note === "string" ? data.note : "",
    channel: typeof data.channel === "string" ? data.channel : "catalog",
    status: typeof data.status === "string" ? data.status as OrderStatus : "new",
    createdAt: timestamp?.toDate?.() ?? null,
  };
}

export default function CustomerAccount({ shopId }: { shopId: string }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALES[locale];
  const linkPending = useSyncExternalStore(subscribeToLocationChange, readSignInLinkState, () => false);
  const productContextId = useSyncExternalStore(
    subscribeToLocationChange,
    () => readProductContextId(shopId),
    () => ""
  );
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [ordersState, setOrdersState] = useState<{
    email: string;
    orders: CatalogOrder[];
    loading: boolean;
    error: string;
  }>({ email: "", orders: [], loading: true, error: "" });
  const [conversations, setConversations] = useState<ShopConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState("");
  const [conversationCreating, setConversationCreating] = useState(false);
  const [openConversationIds, setOpenConversationIds] = useState<Set<string>>(() => new Set());
  const [confirmHideConversationId, setConfirmHideConversationId] = useState<string | null>(null);
  const [hidingConversation, setHidingConversation] = useState(false);
  const [conversationActionError, setConversationActionError] = useState("");
  const [productContext, setProductContext] = useState<ProductContext | null>(null);
  const [productContextError, setProductContextError] = useState<{ id: string; message: string } | null>(null);
  const [email, setEmail] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const completionStarted = useRef(false);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser);
    setAuthLoading(false);
  }), []);

  useEffect(() => {
    const productId = productContextId;
    if (!productId) return;
    if (productId) {
      try {
        window.localStorage.setItem(productStorageKey(shopId), productId);
      } catch (cause) {
        console.error("Could not preserve product context for customer chat", cause);
      }
    }
    if (!/^[A-Za-z0-9_-]{1,150}$/.test(productId)) return;

    let cancelled = false;
    getDoc(doc(db, "shops", shopId, "catalog", productId))
      .then((snapshot) => {
        if (cancelled) return;
        const data = snapshot.data();
        if (!snapshot.exists() || data?.hidden === true || typeof data?.name !== "string") {
          setProductContextError({ id: productId, message: t("chat.productContextUnavailable") });
          return;
        }
        setProductContext({ id: productId, name: data.name });
        setProductContextError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        console.error("Failed to load product context for customer chat", cause);
        setProductContextError({ id: productId, message: translateError(cause, t, "chat.productContextUnavailable") });
      });
    return () => { cancelled = true; };
  }, [shopId, t, productContextId]);

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let storedEmail = "";
    try {
      storedEmail = window.localStorage.getItem(emailStorageKey(shopId)) ?? "";
    } catch {
      storedEmail = "";
    }
    if (!storedEmail || completionStarted.current) return;

    completionStarted.current = true;
    setWorking(true);
    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => {
        try {
          window.localStorage.removeItem(emailStorageKey(shopId));
        } catch {
          // Authentication is complete; blocked storage only means the cached email remains.
        }
        const productId = preservedProductId(shopId);
        window.history.replaceState({}, "", `/catalog/${shopId}/account${productId ? `?productId=${encodeURIComponent(productId)}` : ""}#shop-chat`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      })
      .catch((cause: unknown) => setError(translateError(cause, t, "chat.signInFailed")))
      .finally(() => setWorking(false));
  }, [shopId, t]);

  useEffect(() => {
    if (!user?.emailVerified || !user.email) return;
    const customerEmail = user.email.toLowerCase();
    const ordersQuery = query(
      collection(db, "shops", shopId, "orders"),
      where("customerEmail", "==", customerEmail)
    );
    return onSnapshot(ordersQuery, (snapshot) => {
      const nextOrders = snapshot.docs
        .map((order) => mapOrder(order.id, order.data()))
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      setOrdersState({ email: customerEmail, orders: nextOrders, loading: false, error: "" });
    }, (cause) => {
      console.error("Failed to load customer orders", cause);
      setOrdersState({
        email: customerEmail,
        orders: [],
        loading: false,
        error: translateError(cause, t, "chat.ordersLoadFailed"),
      });
    });
  }, [shopId, user, t]);

  useEffect(() => {
    if (!user?.emailVerified) return;
    const conversationsQuery = query(
      collection(db, "shops", shopId, "conversations"),
      where("customerUid", "==", user.uid)
    );
    return onSnapshot(conversationsQuery, (snapshot) => {
      setConversations(snapshot.docs.map((conversation) => ({
        id: conversation.id,
        customerEmail: conversation.data().customerEmail ?? user.email ?? "",
        productName: typeof conversation.data().productName === "string" ? conversation.data().productName : undefined,
        hiddenByCustomer: conversation.data().hiddenByCustomer === true,
        createdAt: conversation.data().createdAt?.toDate() ?? null,
      })).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)));
      setConversationsLoading(false);
      setConversationsError("");
    }, (cause) => {
      console.error("Failed to load shop conversations", cause);
      setConversationsError(translateError(cause, t, "chat.conversationsLoadFailed"));
      setConversationsLoading(false);
    });
  }, [shopId, user, t]);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || working) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      auth.languageCode = locale;
      const continuation = new URL(`${window.location.origin}/catalog/${shopId}/account`);
      if (productContextId) continuation.searchParams.set("productId", productContextId);
      continuation.hash = "shop-chat";
      await sendSignInLinkToEmail(auth, normalizedEmail, {
        url: continuation.toString(),
        handleCodeInApp: true,
      });
      try {
        window.localStorage.setItem(emailStorageKey(shopId), normalizedEmail);
      } catch {
        // The sign-in link asks for the email again if this browser cannot cache it.
      }
      setEmail(normalizedEmail);
      setNotice(t("chat.linkSent"));
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
        ? cause.code
        : "";
      console.error("Failed to send Firebase email sign-in link", { code });
      const key = emailLinkErrorKey(cause);
      setError(key.startsWith("chat.linkUnknown:")
        ? t("chat.linkUnknown", { code: key.slice("chat.linkUnknown:".length) })
        : t(key));
    } finally {
      setWorking(false);
    }
  }

  async function completeLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || working || !isSignInWithEmailLink(auth, window.location.href)) return;
    setWorking(true);
    setError("");
    try {
      await signInWithEmailLink(auth, normalizedEmail, window.location.href);
      try {
        window.localStorage.removeItem(emailStorageKey(shopId));
      } catch {
        // Authentication is complete; blocked storage only means the cached email remains.
      }
      const productId = preservedProductId(shopId);
      window.history.replaceState({}, "", `/catalog/${shopId}/account${productId ? `?productId=${encodeURIComponent(productId)}` : ""}#shop-chat`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (cause) {
      setError(translateError(cause, t, "chat.signInFailed"));
    } finally {
      setWorking(false);
    }
  }

  async function startConversation() {
    if (!user?.emailVerified || !user.email || conversationCreating) return;
    setConversationCreating(true);
    setConversationsError("");
    try {
      const conversationRef = doc(collection(db, "shops", shopId, "conversations"));
      await setDoc(conversationRef, {
        customerUid: user.uid,
        customerEmail: user.email,
        customerName: user.email.toLowerCase(),
        ...(currentProductContext ? { productId: currentProductContext.id, productName: currentProductContext.name } : {}),
        createdAt: serverTimestamp(),
      });
      setOpenConversationIds((current) => new Set(current).add(conversationRef.id));
      try {
        window.localStorage.removeItem(productStorageKey(shopId));
      } catch (cause) {
        console.error("Could not clear product context after starting customer chat", cause);
      }
      const accountUrl = new URL(window.location.href);
      accountUrl.searchParams.delete("productId");
      window.history.replaceState({}, "", `${accountUrl.pathname}${accountUrl.search}#shop-chat`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (cause) {
      setConversationsError(translateError(cause, t, "chat.conversationStartFailed"));
    } finally {
      setConversationCreating(false);
    }
  }

  function toggleConversation(conversationId: string) {
    setOpenConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  }

  async function hideConversation() {
    if (!confirmHideConversationId || hidingConversation) return;
    setHidingConversation(true);
    setConversationActionError("");
    try {
      await updateDoc(doc(db, "shops", shopId, "conversations", confirmHideConversationId), {
        hiddenByCustomer: true,
      });
      setOpenConversationIds((current) => {
        const next = new Set(current);
        next.delete(confirmHideConversationId);
        return next;
      });
      setConfirmHideConversationId(null);
    } catch (cause) {
      console.error("Failed to hide customer conversation", cause);
      setConversationActionError(translateError(cause, t, "chat.hideConversationFailed"));
      setConfirmHideConversationId(null);
    } finally {
      setHidingConversation(false);
    }
  }

  const signedInCustomer = user?.emailVerified === true && Boolean(user.email);
  const ordersBelongToUser = Boolean(user?.email && ordersState.email === user.email.toLowerCase());
  const orders = ordersBelongToUser ? ordersState.orders : [];
  const ordersLoading = !ordersBelongToUser || ordersState.loading;
  const ordersError = ordersBelongToUser ? ordersState.error : "";
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null;
  const visibleConversations = conversations.filter((conversation) => !conversation.hiddenByCustomer);
  const currentProductContext = productContext?.id === productContextId ? productContext : null;
  const currentProductContextError = productContextError?.id === productContextId ? productContextError.message : "";
  const productContextLoading = /^[A-Za-z0-9_-]{1,150}$/.test(productContextId)
    && !currentProductContext
    && !currentProductContextError;

  useEffect(() => {
    if (!signedInCustomer || window.location.hash !== "#shop-chat") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("shop-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [signedInCustomer]);

  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text-1)", padding: "1.25rem 1rem 4rem" }}>
      <div style={{ width: "min(100%, 980px)", margin: "0 auto" }}>
        <ConfirmDialog
          open={confirmHideConversationId !== null}
          title={t("chat.hideConversationTitle")}
          description={t("chat.hideConversationDescription")}
          confirmText={t("chat.deleteConversation")}
          cancelText={t("cancel")}
          destructive
          confirmDisabled={hidingConversation}
          onConfirm={() => void hideConversation()}
          onCancel={() => setConfirmHideConversationId(null)}
        />
        <Link href={`/catalog/${shopId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-2)", textDecoration: "none", fontSize: "0.82rem", fontWeight: 650 }}>
          <ArrowLeft size={15} /> {t("catalog.title")}
        </Link>

        <header style={{ display: "flex", alignItems: "center", gap: 12, margin: "1.5rem 0 1.1rem" }}>
          <div style={{ display: "grid", placeItems: "center", width: 44, height: 44, flex: "0 0 auto", borderRadius: 12, background: "var(--accent-glow)", color: "var(--accent-2)" }}>
            <MessageCircle size={21} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 780 }}>{t("chat.accountTitle")}</h1>
            <p style={{ margin: "0.25rem 0 0", color: "var(--text-3)", fontSize: "0.82rem" }}>{t("chat.accountSubtitle")}</p>
          </div>
        </header>

        {authLoading ? (
          <div className="glass" aria-busy="true" style={{ minHeight: 150, borderRadius: 14 }} />
        ) : !signedInCustomer ? (
          <section className="glass" style={{ width: "min(100%, 520px)", margin: "2rem auto", padding: "1.3rem", borderRadius: 14 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 750 }}>{t(linkPending ? "chat.completeTitle" : "chat.signInTitle")}</h2>
            <p style={{ margin: "0.5rem 0 1rem", color: "var(--text-2)", fontSize: "0.82rem", lineHeight: 1.55 }}>
              {t(linkPending ? "chat.completeDescription" : "chat.signInDescription")}
            </p>
            <form onSubmit={linkPending ? completeLink : requestLink} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, color: "var(--text-2)", fontSize: "0.76rem", fontWeight: 650 }}>
                {t("chat.email")}
                <input className="input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <button type="submit" className="btn-primary" disabled={working} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 42 }}>
                <Mail size={15} />
                {working ? t("loading") : t(linkPending ? "chat.completeSignIn" : "chat.sendLink")}
              </button>
            </form>
            {notice && <p role="status" style={{ margin: "0.8rem 0 0", color: "var(--green)", fontSize: "0.8rem" }}>{notice}</p>}
            {error && <p role="alert" style={{ margin: "0.8rem 0 0", color: "var(--red)", fontSize: "0.8rem" }}>{error}</p>}
          </section>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "1.2rem 0" }}>
              <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.82rem" }}>{user?.email}</p>
              <button type="button" className="btn-secondary" onClick={() => void signOut(auth)} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "0.4rem 0.7rem", fontSize: "0.76rem" }}>
                <LogOut size={14} /> {t("chat.signOut")}
              </button>
            </div>
            <section id="shop-chat" className="glass" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "1rem", padding: "1rem", borderRadius: 13 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 750 }}>{t("chat.shopConversationTitle")}</h2>
                  <p style={{ margin: "0.3rem 0 0", color: "var(--text-3)", fontSize: "0.76rem" }}>{t("chat.shopConversationDescription")}</p>
                </div>
                <button type="button" className="btn-primary" disabled={conversationCreating || productContextLoading || Boolean(currentProductContextError)} onClick={() => void startConversation()}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 38, padding: "0.45rem 0.75rem", fontSize: "0.76rem" }}>
                  <MessageCircle size={15} /> {conversationCreating || productContextLoading ? t("loading") : currentProductContext ? t("chat.startProductConversation") : t("chat.startConversation")}
                </button>
              </div>
              {productContextLoading && <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.76rem" }}>{t("loading")}</p>}
              {currentProductContextError && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.78rem" }}>{currentProductContextError}</p>}
              {currentProductContext && (
                <p style={{ display: "flex", alignItems: "center", gap: 7, margin: 0, padding: "0.6rem 0.7rem", border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-2)", color: "var(--text-2)", fontSize: "0.76rem" }}>
                  <Package size={14} color="var(--accent-2)" /> {t("chat.productInQuestion")}: <strong style={{ color: "var(--text-1)" }}>{currentProductContext.name}</strong>
                </p>
              )}
              {conversationsError && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.78rem" }}>{conversationsError}</p>}
              {conversationActionError && <p role="alert" style={{ margin: 0, color: "var(--red)", fontSize: "0.78rem" }}>{conversationActionError}</p>}
              {conversationsLoading ? (
                <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.78rem" }}>{t("loading")}</p>
              ) : visibleConversations.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "0.8rem", alignItems: "start" }}>
                  <nav aria-label={t("chat.shopConversations")} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {visibleConversations.map((conversation) => {
                      const isOpen = openConversationIds.has(conversation.id);
                      return (
                        <div key={conversation.id} style={{ display: "flex", alignItems: "stretch", gap: 5 }}>
                          <button type="button" onClick={() => toggleConversation(conversation.id)}
                            aria-expanded={isOpen}
                            style={{ flex: 1, minWidth: 0, padding: "0.65rem", border: `1px solid ${isOpen ? "var(--accent-2)" : "var(--border)"}`, borderRadius: 9, background: isOpen ? "var(--accent-glow)" : "var(--bg-2)", color: "var(--text-1)", textAlign: "left", cursor: "pointer" }}>
                            <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700 }}>{t(isOpen ? "chat.closeConversation" : "chat.openConversation")}</span>
                            {conversation.productName && <span style={{ display: "block", marginTop: 3, color: "var(--text-2)", fontSize: "0.7rem" }}>{t("chat.productInQuestion")}: {conversation.productName}</span>}
                            <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: "0.68rem" }}>{conversation.createdAt?.toLocaleString(intl) ?? "—"}</span>
                          </button>
                          <button type="button" onClick={() => setConfirmHideConversationId(conversation.id)}
                            aria-label={t("chat.deleteConversation")} title={t("chat.deleteConversation")}
                            style={{ alignSelf: "center", display: "grid", placeItems: "center", width: 36, height: 36, flex: "0 0 auto", border: "1px solid var(--border)", borderRadius: 9, background: "var(--bg-2)", color: "var(--text-3)", cursor: "pointer" }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      );
                    })}
                  </nav>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", minWidth: 0 }}>
                    {visibleConversations.filter((conversation) => openConversationIds.has(conversation.id)).map((conversation) => (
                      <OrderConversation
                        key={conversation.id}
                        shopId={shopId}
                        conversationId={conversation.id}
                        authorRole="customer"
                        authorName={user?.email ?? ""}
                        customerEmail={user?.email ?? ""}
                        locale={locale}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, color: "var(--text-3)", fontSize: "0.76rem" }}>{t("chat.noShopConversations")}</p>
              )}
            </section>
            {ordersError && <p role="alert" style={{ color: "var(--red)", fontSize: "0.82rem" }}>{ordersError}</p>}
            {ordersLoading ? (
              <div className="glass" aria-busy="true" style={{ minHeight: 170, borderRadius: 14 }} />
            ) : orders.length === 0 ? (
              <div className="glass" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9, padding: "2rem 1rem", borderRadius: 14, color: "var(--text-3)", textAlign: "center" }}>
                <Package size={28} />
                <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--text-2)" }}>{t("chat.noOrders")}</p>
                <p style={{ margin: 0, maxWidth: 420, fontSize: "0.76rem", lineHeight: 1.5 }}>{t("chat.noOrdersHint")}</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", alignItems: "start", gap: "1rem" }}>
                <nav aria-label={t("chat.myOrders")} className="glass" style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0.65rem", borderRadius: 13 }}>
                  <h2 style={{ margin: "0.3rem 0.45rem 0.45rem", fontSize: "0.8rem", fontWeight: 750 }}>{t("chat.myOrders")}</h2>
                  {orders.map((order) => (
                    <button key={order.id} type="button" onClick={() => setSelectedOrderId(order.id)} aria-current={selectedOrder?.id === order.id ? "true" : undefined}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, width: "100%", padding: "0.65rem", border: `1px solid ${selectedOrder?.id === order.id ? "var(--accent-2)" : "var(--border)"}`, borderRadius: 9, background: selectedOrder?.id === order.id ? "var(--accent-glow)" : "var(--bg-2)", color: "var(--text-1)", textAlign: "left", cursor: "pointer" }}>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: "0.78rem", fontWeight: 750 }}>{order.code}</span>
                        <span style={{ display: "block", marginTop: 3, color: "var(--text-3)", fontSize: "0.68rem" }}>{order.createdAt?.toLocaleDateString(intl) ?? "—"}</span>
                      </span>
                      <span style={{ flex: "0 0 auto", fontSize: "0.68rem", color: "var(--text-2)" }}>{t(`orders.status.${order.status}`)}</span>
                    </button>
                  ))}
                </nav>
                {selectedOrder && (
                  <div className="glass" style={{ display: "flex", flexDirection: "column", gap: "0.9rem", minWidth: 0, padding: "1rem", borderRadius: 13 }}>
                    <header style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 750 }}>{t("chat.order")} {selectedOrder.code}</h2>
                        <p style={{ margin: "0.3rem 0 0", color: "var(--text-3)", fontSize: "0.74rem" }}>
                          {selectedOrder.createdAt?.toLocaleString(intl) ?? "—"} · {t(`orders.status.${selectedOrder.status}`)}
                        </p>
                      </div>
                      <strong style={{ fontSize: "0.9rem" }}>{formatCatalogPrice(selectedOrder.total, intl, selectedOrder.currency ?? BASE_CURRENCY)}</strong>
                    </header>
                    <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: "0.75rem 0", listStyle: "none", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                      {selectedOrder.lines.map((line, index) => (
                        <li key={`${line.productId}-${line.variantId ?? line.variantLabel}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--text-2)", fontSize: "0.77rem" }}>
                          <span>{line.productName}{line.variantLabel ? ` · ${line.variantLabel}` : ""} × {line.quantity}</span>
                          {typeof line.unitPrice === "number" && <span>{formatCatalogPrice(line.unitPrice * line.quantity, intl, selectedOrder.currency ?? BASE_CURRENCY)}</span>}
                        </li>
                      ))}
                    </ul>
                    <OrderConversation
                      key={selectedOrder.id}
                      shopId={shopId}
                      orderId={selectedOrder.id}
                      authorRole="customer"
                      authorName={user?.email ?? ""}
                      customerEmail={user?.email ?? ""}
                      locale={locale}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
