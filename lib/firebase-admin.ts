import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/** The server app is kept separate from the browser app `lib/firebase.ts`
 * initializes, and is only built on first use: the rules test suite imports
 * modules that reach this file with no Firebase environment at all.
 *
 * Credentials come from `FIREBASE_SERVICE_ACCOUNT` (raw or base64 JSON), the
 * `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`
 * trio, or the Firestore emulator. Without any of them the app runs without a
 * server-side Firestore client and the callers fall back to their REST paths. */

const APP_NAME = "logixia-server";

interface AdminState {
  app: App | null | undefined;
  database: Firestore | null | undefined;
  warned: boolean;
}

/** Hot reload re-evaluates this module but keeps the initialized app alive, and
 * `settings()` may only run on a fresh Firestore instance. Holding the state on
 * globalThis keeps both the app and the database usable across reloads. */
const state: AdminState = ((globalThis as typeof globalThis & { __logixiaAdmin?: AdminState }).__logixiaAdmin ??= {
  app: undefined,
  database: undefined,
  warned: false,
});

function warnCredentials(reason: string) {
  if (state.warned) return;
  state.warned = true;
  console.error(`Firebase Admin credentials are unusable: ${reason}`);
}

function serviceAccount(): ServiceAccount | null {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (encoded) {
    try {
      const json = encoded.startsWith("{") ? encoded : Buffer.from(encoded, "base64").toString("utf8");
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
        return {
          projectId: typeof parsed.project_id === "string" ? parsed.project_id : undefined,
          clientEmail: parsed.client_email,
          // Env variables often carry the key on one line with literal `\n`.
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
      warnCredentials("FIREBASE_SERVICE_ACCOUNT has no client_email or private_key.");
    } catch {
      // Next reads only the first line of an unquoted value, so a pretty-printed
      // JSON object arrives as "{". Name that cause instead of a generic parse error.
      warnCredentials(
        "FIREBASE_SERVICE_ACCOUNT could not be parsed. Keep the service account JSON on one line, or use base64-encoded JSON."
      );
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

/** A new app gets its Firestore settings immediately, while an app reused after
 * a hot reload already has them. */
function start(instance: App) {
  getFirestore(instance).settings({ ignoreUndefinedProperties: true });
  state.app = instance;
  return instance;
}

function serverApp(): App | null {
  if (state.app !== undefined) return state.app;
  const existing = getApps().find((candidate) => candidate.name === APP_NAME);
  if (existing) {
    state.app = existing;
    return state.app;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "";
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    state.app = projectId ? start(initializeApp({ projectId }, APP_NAME)) : null;
    return state.app;
  }

  const credentials = serviceAccount();
  if (!credentials) {
    state.app = null;
    return state.app;
  }
  try {
    state.app = start(initializeApp({ credential: cert(credentials), projectId: credentials.projectId ?? projectId }, APP_NAME));
  } catch (cause) {
    console.error("Firebase Admin credentials could not be used", cause);
    state.app = null;
  }
  return state.app;
}

/** Firestore with full server privileges. Returns null when no service account
 * (and no emulator) is configured — the app still works, but order creation
 * and App Check-safe reads are unavailable. */
export function adminDb(): Firestore | null {
  if (state.database !== undefined) return state.database;
  const instance = serverApp();
  state.database = instance ? getFirestore(instance) : null;
  return state.database;
}
