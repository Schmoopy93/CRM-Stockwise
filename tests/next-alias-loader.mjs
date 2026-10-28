import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

/** Lets plain Node run the Next route modules: the app aliases `@/` and imports
 * `next/cache` through the bundler, neither of which Node resolves by itself. */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "next/cache") return nextResolve("next/cache.js", context);
  if (specifier.startsWith("@/")) {
    const base = specifier.slice(2);
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      const url = new URL(candidate, root);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
  }
  return nextResolve(specifier, context);
}
