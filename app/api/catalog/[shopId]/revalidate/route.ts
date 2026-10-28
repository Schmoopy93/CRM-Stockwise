import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { catalogCacheTag } from "@/lib/catalog-api";
import { adminDb } from "@/lib/firebase-admin";
import { bearerToken, verifyFirebaseToken } from "@/lib/firebase-token";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function json(body: { revalidated: true } | { error: string }, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Resolves the caller's shop. The token has already been verified, so the
 * Admin read answers only for the user it was verified as. Without a service
 * account this falls back to reading the caller's own profile with the caller's
 * own token — the "a user may read their own profile" rule decides access. */
async function memberShopId(token: string, uid: string) {
  const admin = adminDb();
  if (admin) {
    const snapshot = await admin.collection("users").doc(uid).get();
    const shopId = snapshot.data()?.shopId;
    return typeof shopId === "string" ? shopId : null;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) return null;
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const document = (await response.json()) as { fields?: { shopId?: { stringValue?: string } } };
  return document.fields?.shopId?.stringValue ?? null;
}

/** Marks the shop's public catalog stale after a catalog-affecting write. The
 * client calls this best-effort, so a failure leaves the TTL as the backstop. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  if (!ID_PATTERN.test(shopId)) return json({ error: "invalid-shop" }, 400);

  const token = bearerToken(request);
  if (!token) return json({ error: "unauthorized" }, 401);
  const uid = await verifyFirebaseToken(token);
  if (!uid) return json({ error: "unauthorized" }, 401);

  const callerShopId = await memberShopId(token, uid).catch(() => null);
  if (callerShopId !== shopId) return json({ error: "forbidden" }, 403);

  revalidateTag(catalogCacheTag(shopId), { expire: 0 });
  return json({ revalidated: true });
}
