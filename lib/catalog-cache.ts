import { auth } from "@/lib/firebase";

/** Catalog writes often arrive as a burst — one receipt with many lines, a bulk
 * import — so calls are coalesced per shop into a single request. */
const COALESCE_MS = 300;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Marks the shop's public catalog stale on the server after a write. Best-effort
 * on purpose: a failed call only means the catalog can lag by its cache TTL, so
 * it must never fail the merchant's save. */
export function invalidateCatalogCache(shopId: string) {
  const pending = timers.get(shopId);
  if (pending) clearTimeout(pending);
  timers.set(shopId, setTimeout(() => {
    timers.delete(shopId);
    void send(shopId);
  }, COALESCE_MS));
}

/** Same, but awaited and without coalescing. Used when the shop is about to
 * stop existing — the session that proves membership is deleted right after,
 * so the request cannot wait for a timer. */
export async function invalidateCatalogCacheNow(shopId: string) {
  const pending = timers.get(shopId);
  if (pending) {
    clearTimeout(pending);
    timers.delete(shopId);
  }
  await send(shopId);
}

async function send(shopId: string) {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    await fetch(`/api/catalog/${encodeURIComponent(shopId)}/revalidate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      keepalive: true,
    });
  } catch {
    // The cache TTL is the backstop; the write itself already succeeded.
  }
}
