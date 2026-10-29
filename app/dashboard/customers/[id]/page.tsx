"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCustomer, useCustomerActivity, useShopMoney } from "@/lib/hooks";
import { INTL_LOCALES, translateError, useI18n } from "@/lib/i18n-context";
import { deleteCustomer } from "@/lib/actions";
import CustomerForm from "@/components/CustomerForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import CustomerDetailView from "./customer-detail-view";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { locale, t } = useI18n();
  const shopId = profile?.shopId;
  const { customer, loading } = useCustomer(shopId, id);
  const { sales, orders } = useCustomerActivity(shopId, id);
  const { money } = useShopMoney(shopId, INTL_LOCALES[locale]);

  const [formOpen, setFormOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!shopId) return;
    setDeleting(true);
    setError("");
    try {
      await deleteCustomer(shopId, id);
      router.replace("/dashboard/customers");
    } catch (cause) {
      setError(translateError(cause, t, "customers.deleteError"));
      setDeleting(false);
    }
  }

  if (!shopId) return null;

  return (
    <>
      <ConfirmDialog
        open={confirmDelete}
        title={t("customers.deleteConfirmTitle")}
        description={t("customers.deleteConfirm", { name: customer?.name ?? "" })}
        confirmText={t("delete")}
        cancelText={t("cancel")}
        destructive
        confirmDisabled={deleting}
        onConfirm={() => {
          setConfirmDelete(false);
          void remove();
        }}
        onCancel={() => setConfirmDelete(false)}
      />

      {loading ? (
        <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="spinner" />
        </div>
      ) : !customer ? (
        <div className="fade-up" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", paddingTop: "3rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-2)", margin: 0 }}>{t("customers.notFound")}</p>
          <Link href="/dashboard/customers" className="pform-back">
            <ArrowLeft size={14} />
            {t("customers.backToList")}
          </Link>
        </div>
      ) : (
        <CustomerDetailView
          customer={customer}
          sales={sales}
          orders={orders}
          money={money}
          deleting={deleting}
          error={error}
          onEdit={() => setFormOpen(true)}
          onDelete={() => setConfirmDelete(true)}
        />
      )}

      {formOpen && customer && (
        <CustomerForm
          shopId={shopId}
          customer={customer}
          onSaved={() => setFormOpen(false)}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
