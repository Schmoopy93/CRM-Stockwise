/**
 * Exchanges a Firebase ID token for the caller's uid via the Identity Toolkit.
 * Used by the authenticated API routes so they can tell a real signed-in user
 * from anyone who simply claims a bearer token. Returns null when the project
 * is not configured, the token is invalid, or the lookup fails.
 */
export async function verifyFirebaseToken(token: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
        cache: "no-store",
      }
    );
    if (!response.ok) return null;
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("users" in result) || !Array.isArray(result.users)) return null;
    const firstUser = result.users[0];
    return firstUser && typeof firstUser === "object" && "localId" in firstUser && typeof firstUser.localId === "string"
      ? firstUser.localId
      : null;
  } catch {
    return null;
  }
}

/** Reads the bearer token from an Authorization header, if present. */
export function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice(7) : "";
}
