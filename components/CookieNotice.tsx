"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n-context";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "inventory-cookie-notice";
const CHANGE_EVENT = "inventory-cookie-notice-change";

const noticeStore = {
  subscribe(onChange: () => void) {
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get(): boolean {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  },
  dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  },
};

export function CookieNotice() {
  const { t } = useI18n();
  const pathname = usePathname();
  const dismissed = useSyncExternalStore(noticeStore.subscribe, noticeStore.get, () => true);

  if (dismissed || pathname === "/cookies") return null;

  return (
    <div
      role="region"
      aria-label={t("cookies.title")}
      className="cookie-notice"
      style={{ position: "fixed", left: 16, bottom: 16, zIndex: 45, maxWidth: 420, display: "flex", alignItems: "center", gap: 12, padding: "0.8rem 0.9rem", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", animation: "fadeUp 0.25s ease" }}
    >
      <Cookie size={18} color="var(--accent-2)" style={{ flexShrink: 0 }} />
      <p style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.5, color: "var(--text-2)", flex: 1 }}>
        {t("cookies.notice")}{" "}
        <Link href="/cookies" style={{ color: "var(--accent-2)", fontWeight: 600 }}>{t("cookies.noticeLink")}</Link>
      </p>
      <button type="button" onClick={noticeStore.dismiss} className="btn-primary" style={{ flexShrink: 0, padding: "0.45rem 0.85rem", fontSize: "0.76rem" }}>
        {t("cookies.noticeOk")}
      </button>
      <style>{`
        @media (max-width: 480px) {
          .cookie-notice { right: 80px; left: 12px !important; bottom: 12px !important; flex-wrap: wrap; }
        }
      `}</style>
    </div>
  );
}
