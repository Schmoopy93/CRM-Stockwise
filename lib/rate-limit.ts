import { getApps, initializeApp } from "firebase/app";
import { doc, getFirestore, runTransaction, Timestamp } from "firebase/firestore";

/**
 * Shared rate limiting for the AI routes.
 *
 * The limiter state lives in Firestore so every serverless instance shares the
 * same budget — an in-process Map only ever limits the single instance that
 * happened to receive the request. Firestore is the store of record; a bounded
 * in-process Map is kept only as a fallback for when Firestore is unreachable
 * (rules not deployed yet, local emulator off), so a Firestore outage degrades
 * the limit instead of removing it.
 */

const app = getApps()[0] ?? initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

const db = getFirestore(app);

const FALLBACK_MAX_ENTRIES = 5_000;
const WINDOW_MS = 60_000;
const fallback = new Map<string, { count: number; windowStart: number }>();

/** Drops expired entries so a long-lived instance cannot grow without bound. */
function pruneFallback(now: number) {
  if (fallback.size <= FALLBACK_MAX_ENTRIES) return;
  for (const [key, entry] of fallback) {
    if (now - entry.windowStart >= WINDOW_MS) fallback.delete(key);
    if (fallback.size <= FALLBACK_MAX_ENTRIES) break;
  }
}

function consumeFallback(key: string, limit: number, now: number) {
  pruneFallback(now);
  const entry = fallback.get(key);
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    fallback.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

/** Document ids may only contain a limited character set, and keys embed an IP
 * address, so they are hashed rather than escaped. */
async function keyToDocId(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Counts one call against `key` and reports whether it is within budget.
 * Returns `true` when the call is allowed.
 */
export async function consumeRateLimit(key: string, limit: number): Promise<boolean> {
  const now = Date.now();
  try {
    const ref = doc(db, "rateLimits", await keyToDocId(key));
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.data() ?? {};
      const windowStart = data.windowStart instanceof Timestamp ? data.windowStart.toMillis() : 0;
      if (now - windowStart >= WINDOW_MS || windowStart === 0) {
        transaction.set(ref, { windowStart: Timestamp.fromMillis(now), count: 1 });
        return true;
      }
      const count = typeof data.count === "number" ? data.count : 0;
      if (count >= limit) return false;
      transaction.update(ref, { count: count + 1 });
      return true;
    });
  } catch (cause) {
    console.error("Rate limit store unavailable, using in-process fallback:", cause);
    return consumeFallback(key, limit, now);
  }
}
