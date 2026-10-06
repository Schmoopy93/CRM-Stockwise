import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

initializeApp();

/** Brevo transactional email: a single verified sender address is enough, so
 * notifications work before a custom domain exists. Free tier: 300 emails/day. */
const EMAIL_API_KEY = defineSecret("EMAIL_API_KEY");
const EMAIL_SENDER = defineString("EMAIL_SENDER", {
  description: "Verified Brevo sender address that order notifications come from",
});
const EMAIL_FROM_NAME = defineString("EMAIL_FROM_NAME", { default: "Stockwise" });
const APP_URL = defineString("APP_URL", { default: "https://crm-inventory-chi.vercel.app" });

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface OrderLine {
  productName?: string;
  variantLabel?: string;
  quantity?: number;
  unitPrice?: number;
}

function formatLines(lines: OrderLine[], currency: string): string {
  return lines
    .map((line) => {
      const name = `${line.productName ?? "?"}${line.variantLabel ? ` (${line.variantLabel})` : ""}`;
      const quantity = Number(line.quantity ?? 0);
      const unitPrice = Number(line.unitPrice ?? 0);
      return `<tr>
        <td style="padding:3px 0">${escapeHtml(name)}</td>
        <td style="padding:3px 0;text-align:center;white-space:nowrap">×${quantity}</td>
        <td style="padding:3px 0;text-align:right;white-space:nowrap">${unitPrice.toFixed(2)} ${escapeHtml(currency)}</td>
      </tr>`;
    })
    .join("");
}

/**
 * Emails the shop owner when a catalog order arrives — the in-app toast only
 * helps while the dashboard is open. The owner is resolved the same way the
 * app resolves it: shops/{shopId}.createdBy → the Auth account's email.
 * The order carries the currency it was quoted in, so the email repeats it.
 */
export const notifyNewOrder = onDocumentCreated(
  {
    document: "shops/{shopId}/orders/{orderId}",
    region: "europe-west1",
    secrets: [EMAIL_API_KEY],
  },
  async (event) => {
    const order = event.data?.data();
    if (!order) return;

    // Only freshly placed orders notify; a scripted import or a backdated
    // document must not spam the owner's inbox.
    if (order.status && order.status !== "new") return;

    const { shopId, orderId } = event.params;
    const shopSnap = await getFirestore().doc(`shops/${shopId}`).get();
    const ownerUid = shopSnap.get("createdBy");
    if (typeof ownerUid !== "string" || !ownerUid) {
      logger.warn("Order email skipped: shop has no owner", { shopId, orderId });
      return;
    }

    let recipient: string | undefined = undefined;
    try {
      recipient = (await getAuth().getUser(ownerUid)).email;
    } catch (cause) {
      logger.warn("Order email skipped: owner account unreadable", { shopId, ownerUid, cause });
      return;
    }
    if (!recipient) {
      logger.warn("Order email skipped: owner has no email", { shopId, ownerUid });
      return;
    }

    const shopName = typeof shopSnap.get("name") === "string" ? (shopSnap.get("name") as string) : "";
    const code = typeof order.code === "string" ? order.code : orderId;
    const currency = typeof order.currency === "string" ? order.currency : "EUR";
    const total = Number(order.total ?? 0);
    const lines = Array.isArray(order.lines) ? (order.lines as OrderLine[]) : [];
    const note = typeof order.note === "string" ? order.note.trim() : "";
    const appUrl = APP_URL.value();

    const subject = `Nova porudžbina ${code}${shopName ? ` — ${shopName}` : ""}`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#111827">
  <h2 style="margin:0 0 2px;font-size:18px">Nova porudžbina ${escapeHtml(code)}</h2>
  <p style="margin:0 0 18px;color:#6b7280;font-size:13px">${escapeHtml(shopName)}</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr><td style="padding:3px 0;color:#6b7280">Kupac</td><td style="padding:3px 0;text-align:right">${escapeHtml(order.customerName)}</td></tr>
    <tr><td style="padding:3px 0;color:#6b7280">Kontakt</td><td style="padding:3px 0;text-align:right">${escapeHtml(order.customerContact)}</td></tr>
    <tr><td style="padding:3px 0;color:#6b7280">Adresa</td><td style="padding:3px 0;text-align:right">${escapeHtml(order.customerAddress)}, ${escapeHtml(order.customerCity)}</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
  <table style="width:100%;border-collapse:collapse;font-size:14px">${formatLines(lines, currency)}</table>
  <p style="font-size:16px;font-weight:700;margin:16px 0 0">Ukupno: ${total.toFixed(2)} ${escapeHtml(currency)}</p>
  ${note ? `<p style="margin:12px 0 0;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151">Napomena: ${escapeHtml(note)}</p>` : ""}
  <a href="${appUrl}/dashboard/orders" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#6366f1;color:#ffffff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Otvori porudžbine</a>
</div>`;

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": EMAIL_API_KEY.value(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: EMAIL_FROM_NAME.value(), email: EMAIL_SENDER.value() },
        to: [{ email: recipient }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      logger.error("Brevo rejected the order email", { status: response.status, detail, shopId, orderId });
      // No retry is configured (default), so throwing only marks the failure in
      // the logs — it cannot double-send.
      throw new Error(`Brevo send failed (${response.status})`);
    }

    logger.info("Order notification emailed", { shopId, orderId, code });
  }
);
