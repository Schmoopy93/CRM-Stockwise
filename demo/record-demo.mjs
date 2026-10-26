#!/usr/bin/env node
/**
 * Logixia demo recorder.
 *
 *   npm i -D playwright
 *   npm run demo:setup   # first run only: sign in with Google in the opened window
 *   npm run demo         # records demo/recordings/logixia-demo-*.mp4
 *
 * Options:
 *   --base-url <url>   default http://localhost:3000
 *   --shop-id <id>     public catalog shop (defaults to the demo shop)
 *   --mutate           record a sale and storno it (changes real demo data)
 *   --headed           show the browser while recording
 *   --no-captions      no lower-third captions in the video
 *   --skip-catalog     omit the merchant public-catalog preview scene
 *   --skip-customer    omit the signed-out mobile and customer recordings
 *   --profile <dir>    browser profile directory (default demo/.profile)
 *   --out <dir>        recording output directory (default demo/recordings)
 *
 * The tour is read-only on purpose: it opens dialogs and cancels them, fills
 * forms without submitting, and only clicks things that cannot reach Firestore
 * as a write (the single exception is opening a customer conversation, which
 * records a read receipt).
 *
 * Scenes adapt to the demo shop's data: the low-stock panel is shown when at
 * least one product sits at or below its minimum, and line-item fulfillment is
 * demonstrated when a confirmed/fulfilling order exists. Both are skipped on a
 * shop with none, so the same script records any demo dataset.
 *
 * Three segments are recorded: the merchant tour with the signed-in profile, a
 * short mobile pass through the catalog filter sheet, and the customer tour in
 * a throwaway profile (catalog, variants, cart, checkout, passwordless
 * account). The mobile clip is scaled into the 16:9 canvas and all parts are
 * merged into one MP4 when ffmpeg is available.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SR = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/i18n/sr.json"), "utf8"));
const SAMPLE_IMAGE = path.join(ROOT, "public/og.png");
const RUN_ID = Date.now().toString(36).slice(-5).toUpperCase();
const LOW_STOCK_HINT = SR["notify.lowStockBadge"].replace("{n}", "").trim();
const ORDER_ACTION_LABELS = [
  SR["orders.confirm"],
  SR["orders.fulfill"],
  SR["orders.fulfillSelected"],
  SR["orders.resumeFulfill"],
];

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  const header = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0];
  console.log(`${header}*/\n`);
  process.exit(0);
}

const SETUP = Boolean(opts.setup);
const MUTATE = Boolean(opts.mutate);
const HEADED = Boolean(opts.headed);
const CAPTIONS = !opts["no-captions"];
const SKIP_CATALOG = Boolean(opts["skip-catalog"]);
const SKIP_CUSTOMER = Boolean(opts["skip-customer"]);
const BASE_URL = String(opts["base-url"] ?? process.env.DEMO_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SHOP_ID = String(opts["shop-id"] ?? process.env.DEMO_SHOP_ID ?? "cMSZnwTNXABMGDAJrH1b");
const PROFILE_DIR = path.resolve(ROOT, String(opts.profile ?? "demo/.profile"));
const OUT_DIR = path.resolve(ROOT, String(opts.out ?? "demo/recordings"));
const VIEWPORT = { width: 1920, height: 1080 };
const MOBILE_VIEWPORT = { width: 430, height: 932 };

let cursor = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 };
let sampleProduct = "";

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      parsed[key] = value;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error("\nPlaywright nije instaliran. Pokreni:\n  npm i -D playwright\n");
    process.exit(1);
  }
}

async function openContext(chromium, { record, headed, profileDir = PROFILE_DIR, viewport = VIEWPORT }) {
  fs.mkdirSync(profileDir, { recursive: true });
  if (record) fs.mkdirSync(OUT_DIR, { recursive: true });

  const options = {
    headless: !headed,
    viewport,
    locale: "sr-RS",
    timezoneId: "Europe/Belgrade",
    colorScheme: "dark",
    permissions: ["clipboard-read", "clipboard-write"],
    acceptDownloads: false,
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    ...(record ? { recordVideo: { dir: OUT_DIR, size: viewport } } : {}),
  };

  // Google sign-in tends to distrust Playwright's bundled Chromium, so prefer
  // the installed Chrome and fall back when it is not available. The profile can
  // stay locked for a moment after a previous window closes, hence the retry.
  try {
    return await chromium.launchPersistentContext(profileDir, { ...options, channel: "chrome" });
  } catch {
    await sleep(1500);
    try {
      return await chromium.launchPersistentContext(profileDir, { ...options, channel: "chrome" });
    } catch (error) {
      console.warn(`[demo] Chrome nije dostupan (${error?.message?.split("\n")[0]}); koristim Playwright Chromium.`);
      return chromium.launchPersistentContext(profileDir, options);
    }
  }
}

async function installOverlays(context, { seedCookieNotice = true } = {}) {
  await context.addInitScript(
    ({ locale, theme, captions, showCursor, seedCookies }) => {
      try {
        localStorage.setItem("inventory-locale", locale);
        localStorage.setItem("inventory-theme", theme);
        // The merchant tour keeps the consent banner out of the way; the
        // customer tour records it and dismisses it on camera.
        if (seedCookies) localStorage.setItem("inventory-cookie-notice", "1");
        // The catalog share button prefers the native share sheet; disabling it
        // makes the demo show the clipboard fallback the toast is built around.
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
        Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
      } catch {}

      if (window.top !== window) return;

      const boot = () => {
        if (document.getElementById("demo-cover")) return;

        const style = document.createElement("style");
        style.textContent = [
          "#demo-cover{position:fixed;inset:0;z-index:2147483646;background:#0f0f14;pointer-events:none;opacity:1;transition:opacity .45s ease}",
          "#demo-cursor{position:fixed;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#818cf8;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.45);z-index:2147483647;pointer-events:none;transform:translate3d(960px,540px,0);transition:transform .06s linear}",
          ".demo-ripple{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid #a5b4fc;z-index:2147483647;pointer-events:none;animation:demo-ripple .5s ease-out forwards}",
          "@keyframes demo-ripple{from{opacity:.9;transform:scale(1)}to{opacity:0;transform:scale(4)}}",
          "#demo-caption{position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;display:flex;align-items:center;gap:10px;padding:12px 22px 12px 16px;border-radius:999px;background:rgba(15,15,20,.82);border:1px solid rgba(255,255,255,.12);box-shadow:0 12px 40px rgba(0,0,0,.35);backdrop-filter:blur(14px);color:#f0f0f5;font-family:Inter,'Segoe UI',sans-serif;font-size:15px;font-weight:600;letter-spacing:.01em;opacity:0;transition:opacity .25s ease}",
          "#demo-caption[data-show='1']{opacity:1}",
          "#demo-caption .demo-caption-dot{width:7px;height:7px;border-radius:50%;background:#818cf8;box-shadow:0 0 12px #6366f1}",
          "#demo-caption .demo-caption-brand{color:#8b8b9e;font-weight:500}",
          "#demo-outro{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0f0f14;opacity:0;transition:opacity .5s ease;pointer-events:none}",
          "#demo-outro[data-show='1']{opacity:1}",
          "#demo-outro .demo-outro-brand{font-family:var(--font-display),'Segoe UI',sans-serif;font-size:42px;font-weight:700;letter-spacing:-.05em;background:linear-gradient(110deg,#f0f0f5 15%,#818cf8 90%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}",
          "#demo-outro .demo-outro-sub{color:#8b8b9e;font-family:Inter,'Segoe UI',sans-serif;font-size:14px}",
          "@media (max-width:760px){#demo-caption{top:14px;bottom:auto;left:12px;right:12px;transform:none;justify-content:center;font-size:13px;padding:9px 14px;border-radius:12px}}",
        ].join("");
        document.documentElement.appendChild(style);

        const cover = document.createElement("div");
        cover.id = "demo-cover";
        document.documentElement.appendChild(cover);
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            cover.style.opacity = "0";
            setTimeout(() => cover.remove(), 600);
          })
        );

        if (showCursor) {
          const dot = document.createElement("div");
          dot.id = "demo-cursor";
          document.documentElement.appendChild(dot);
          window.addEventListener(
            "mousemove",
            (event) => {
              dot.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0)`;
            },
            { passive: true }
          );
          window.addEventListener(
            "mousedown",
            (event) => {
              const ripple = document.createElement("span");
              ripple.className = "demo-ripple";
              ripple.style.left = `${event.clientX}px`;
              ripple.style.top = `${event.clientY}px`;
              document.documentElement.appendChild(ripple);
              setTimeout(() => ripple.remove(), 520);
            },
            { passive: true }
          );
        }

        if (captions) {
          const caption = document.createElement("div");
          caption.id = "demo-caption";
          caption.innerHTML =
            '<span class="demo-caption-dot"></span><span class="demo-caption-brand">Logixia</span><span id="demo-caption-text"></span>';
          document.documentElement.appendChild(caption);
          window.__demoCaption = (text) => {
            const node = document.getElementById("demo-caption-text");
            if (!node || node.textContent === text) return;
            node.textContent = text;
            caption.dataset.show = "1";
          };
        }

        window.__demoOutro = () => {
          document.getElementById("demo-caption")?.setAttribute("data-show", "0");
          if (document.getElementById("demo-outro")) return;
          const outro = document.createElement("div");
          outro.id = "demo-outro";
          outro.innerHTML =
            '<div class="demo-outro-brand">Logixia</div><div class="demo-outro-sub">Vodite radnju pametnije.</div>';
          document.documentElement.appendChild(outro);
          requestAnimationFrame(() => {
            outro.dataset.show = "1";
          });
        };
      };

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
      } else {
        boot();
      }
    },
    { locale: "sr", theme: "dark", captions: CAPTIONS, showCursor: true, seedCookies: seedCookieNotice }
  );
}

async function caption(page, text) {
  if (!CAPTIONS) return;
  await page.evaluate((value) => window.__demoCaption?.(value), text).catch(() => {});
}

async function pointOf(locator) {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element nije vidljiv");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function bringIntoView(locator, block = "center") {
  await locator.waitFor({ state: "visible", timeout: 20000 });
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block).catch(() => {});
  await sleep(700);
}

async function glide(page, target, { steps = 22, delay = 10 } = {}) {
  const to = typeof target.x === "number" ? target : await pointOf(target);
  const from = { ...cursor };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    await page.mouse.move(x, y);
    cursor = { x, y };
    if (delay) await sleep(delay);
  }
}

async function click(page, locator) {
  const target = locator.first();
  await bringIntoView(target);
  await glide(page, target);
  await sleep(170);
  await target.click();
}

async function hover(page, locator) {
  const target = locator.first();
  await bringIntoView(target);
  await glide(page, target);
  await sleep(550);
}

async function selectValue(page, locator, value) {
  const target = locator.first();
  await bringIntoView(target);
  await glide(page, target);
  await sleep(180);
  await target.selectOption(value);
  await sleep(700);
}

async function scroll(page, distance, { steps = 18, delay = 26, at = { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 } } = {}) {
  await glide(page, at, { steps: 12, delay: 6 });
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, distance / steps);
    await sleep(delay);
  }
  await sleep(320);
}

async function scrollTop(page) {
  await page.evaluate(() => {
    document.querySelector(".app-main")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  });
  await sleep(350);
}

async function waitForApp(page) {
  await page.waitForSelector(".app-sidebar", { timeout: 30000 });
  await page.waitForSelector(".app-main h1", { timeout: 30000 });
  await page.waitForFunction(
    () => {
      const main = document.querySelector(".app-main");
      return main && main.textContent.trim().length > 40;
    },
    null,
    { timeout: 30000 }
  );
}

async function waitForAny(page, selectors, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (await page.locator(selector).first().isVisible().catch(() => false)) return true;
    }
    await sleep(250);
  }
  return false;
}

async function nav(page, href, text) {
  await caption(page, text);
  const link = page.locator(`.app-sidebar a[href="${href}"]`).first();
  await click(page, link);
  await page.waitForURL(`**${href}`, { timeout: 15000 }).catch(() => {});
  await sleep(1300);
  await scrollTop(page);
}

async function fadeTo(page, url) {
  await page
    .evaluate(() => {
      const fade = document.createElement("div");
      fade.style.cssText =
        "position:fixed;inset:0;z-index:2147483645;background:#0f0f14;opacity:0;transition:opacity .45s ease;pointer-events:none";
      document.documentElement.appendChild(fade);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          fade.style.opacity = "1";
        })
      );
    })
    .catch(() => {});
  await sleep(550);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.mouse.move(cursor.x, cursor.y).catch(() => {});
  await sleep(1100);
}

async function typeInto(page, locator, text) {
  const target = locator.first();
  await click(page, target);
  await target.fill("");
  await target.pressSequentially(text, { delay: 42 });
  await sleep(550);
}

async function cancelDialog(page, dialog, { byText = SR["cancel"] } = {}) {
  const cancel = dialog.getByRole("button", { name: byText, exact: true }).first();
  if (await cancel.count()) {
    await click(page, cancel);
  } else {
    const close = dialog.locator('button[aria-label="Zatvori"]').first();
    if (await close.count()) await click(page, close);
  }
  await sleep(650);
}

async function attempt(label, fn) {
  console.log(`[demo] Scena: ${label}`);
  try {
    await fn();
  } catch (error) {
    console.warn(`[demo] Scena „${label}“ preskočena: ${error?.message ?? error}`);
  }
}

/* ─────────────────────────────── scenes ─────────────────────────────── */

async function sceneLanding(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-hero-title", { timeout: 30000 });
  await sleep(1900);
  await caption(page, "Ulazna strana — sve zalihe na jednom mestu");
  await glide(page, page.locator(".login-hero-title"));
  await sleep(750);
  await glide(page, page.locator(".login-hero-visual"));
  await sleep(550);

  await scroll(page, 540, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.7 } });
  await caption(page, "Kako funkcioniše — u tri koraka");
  await sleep(950);
  await scroll(page, 720, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.7 } });
  await caption(page, "Sve funkcije na jednom mestu");
  await sleep(1000);
  const features = page.locator(".login-feature-card");
  const featureCount = Math.min(await features.count(), 4);
  for (let i = 0; i < featureCount; i += 1) {
    await hover(page, features.nth(i));
    if (i === 0) await caption(page, "Zalihe, prodaja, kupci, katalog, uvoz i analitika");
    await sleep(280);
  }
  await scroll(page, 640, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.7 } });
  await caption(page, "Spremni da vodite radnju pametnije");
  await sleep(850);
  const finalCta = page.locator(".login-final-cta .login-cta-primary").first();
  if (await finalCta.count()) {
    await hover(page, finalCta);
    await sleep(650);
  }
  await scroll(page, 360, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.7 } });
  const footerPrivacy = page.locator('.login-footer a[href="/privacy"]').first();
  if (await footerPrivacy.count()) {
    await hover(page, footerPrivacy);
    await caption(page, "Politike privatnosti, kolačića i uslovi su na svakom ekranu");
    await sleep(900);
  }

  await scrollTop(page);
  const toLight = page.locator('button[aria-label="Switch to light mode"]').first();
  if (await toLight.count()) {
    await click(page, toLight);
    await sleep(850);
    await caption(page, "Svetla tema je visokog kontrasta");
    await sleep(750);
    const toDark = page.locator('button[aria-label="Switch to dark mode"]').first();
    if (await toDark.count()) await click(page, toDark);
    await sleep(700);
  }

  const english = page.locator('button[aria-label="English"]').first();
  if (await english.count()) {
    await click(page, english);
    await caption(page, "Podrška za šest jezika");
    await sleep(2600);
    const serbian = page.locator('button[aria-label="Srpski"]').first();
    if (await serbian.count()) {
      await click(page, serbian);
      await sleep(2600);
    }
  }

  const cta = page.locator("button.login-cta-primary").first();
  if (await cta.count()) {
    await click(page, cta);
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.count()) {
      await dialog.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
      await sleep(850);
      await caption(page, "Nova radnja ili pridruživanje postojećem timu");
      const joinTab = dialog.getByRole("button", { name: SR["auth.joinShop"], exact: true }).first();
      if (await joinTab.count()) {
        await click(page, joinTab);
        await sleep(700);
        const shopIdInput = dialog.locator(`input[placeholder="${SR["auth.shopId"]}"]`).first();
        if (await shopIdInput.count()) {
          await click(page, shopIdInput);
          await shopIdInput.fill("demo-radnja-01");
          await sleep(500);
        }
        await caption(page, "Pridruživanje radnji preko Shop ID-ja");
        await sleep(900);
      }
      const loginTab = dialog.getByRole("button", { name: SR["auth.login"], exact: true }).first();
      if (await loginTab.count()) {
        await click(page, loginTab);
        await sleep(700);
        await caption(page, "Prijava postojećeg naloga Google-om");
        const google = dialog.getByRole("button", { name: SR["auth.googleBtn"], exact: true }).first();
        if (await google.count()) {
          await hover(page, google);
          await sleep(750);
        }
      }
      const close = dialog.locator(`button[aria-label="${SR["catalog.close"]}"]`).first();
      if (await close.count()) await click(page, close);
      await sleep(700);
    }
  }

  const fab = page.locator(".ask-ai-fab").first();
  if (await fab.count()) {
    await click(page, fab);
    const panel = page.locator(".ask-ai-panel").first();
    if (await panel.count()) {
      await panel.waitFor({ state: "visible", timeout: 12000 }).catch(() => {});
      await sleep(850);
      await caption(page, "AI asistent odgovara na pitanja o platformi");
      await sleep(850);
      const input = panel.locator(`textarea[aria-label="${SR["login.ask.placeholder"]}"]`).first();
      if (await input.count()) {
        await click(page, input);
        await input.fill("");
        await input.pressSequentially("Šta sve Logixia može?", { delay: 35 });
        await sleep(450);
        const send = panel.locator(`button[aria-label="${SR["login.ask.button"]}"]`).first();
        if (await send.count()) {
          await click(page, send);
          await page.waitForSelector(".ask-ai-panel .spin", { timeout: 4000 }).catch(() => {});
          await page.waitForFunction(() => !document.querySelector(".ask-ai-panel .spin"), null, { timeout: 25000 }).catch(() => {});
          await sleep(1400);
          await caption(page, "Odgovor stiže u nekoliko sekundi");
          await sleep(1700);
        }
      }
      const closeAsk = panel.locator(`button[aria-label="${SR["login.ask.close"]}"]`).first();
      if (await closeAsk.count()) await click(page, closeAsk);
      await sleep(600);
    }
  }
}

async function sceneDashboard(page) {
  await fadeTo(page, `${BASE_URL}/dashboard`);
  await waitForApp(page);
  await sleep(1600);
  await caption(page, "Pregled poslovanja");
  await glide(page, page.locator(".app-main h1"));
  await sleep(700);
  const statCards = page.locator(".dashboard-stats > div");
  const statCount = Math.min(await statCards.count(), 5);
  for (let i = 0; i < statCount; i += 1) {
    await glide(page, statCards.nth(i), { steps: 14, delay: 8 });
    await sleep(280);
  }

  const lowStockWidget = page
    .locator(".app-sidebar button[aria-expanded]")
    .filter({ hasText: LOW_STOCK_HINT })
    .first();
  if (await lowStockWidget.count()) {
    await click(page, lowStockWidget);
    await sleep(850);
    await caption(page, "Artikli ispod minimuma — proaktivno upozorenje");
    await sleep(950);
    const lowStockItem = page.locator('.app-sidebar a[href^="/dashboard/products/"]').first();
    if (await lowStockItem.count()) {
      await glide(page, lowStockItem);
      await caption(page, "Stanje i minimum za svaki artikal");
      await sleep(1000);
    }
    const enableDesktop = page.locator(".app-sidebar button").filter({ hasText: SR["notify.enableDesktop"] }).first();
    const desktopEnabled = page.locator(".app-sidebar").getByText(SR["notify.desktopEnabled"], { exact: false }).first();
    if (await enableDesktop.count()) {
      await hover(page, enableDesktop);
      await caption(page, "Desktop obaveštenje se uključuje jednim klikom");
      await sleep(900);
    } else if (await desktopEnabled.count()) {
      await glide(page, desktopEnabled);
      await caption(page, "Desktop obaveštenja su uključena");
      await sleep(800);
    }
    await click(page, lowStockWidget);
    await sleep(500);
  }

  const orderNav = page.locator('.app-sidebar a[aria-label^="Porudžbine:"]').first();
  if (await orderNav.count()) {
    await hover(page, orderNav);
    await caption(page, "Broj novih porudžbina i nepročitanih poruka");
    await sleep(900);
  }

  const shopId = page.locator('.app-sidebar span[title="Copy"]').first();
  if (await shopId.count()) {
    await click(page, shopId);
    await caption(page, "Shop ID se deli sa zaposlenima jednim klikom");
    await sleep(750);
  }

  const logoutButton = page.locator(".app-sidebar button").filter({ hasText: SR["user.logout"] }).first();
  if (await logoutButton.count()) {
    await hover(page, logoutButton);
    await sleep(600);
  }

  const currencySelect = page.locator(`select[aria-label="${SR["currency.label"]}"]`).first();
  if (await currencySelect.count()) {
    await bringIntoView(currencySelect);
    await caption(page, "Valuta prodavnice");
    await sleep(700);
    await selectValue(page, currencySelect, "RSD");
    await sleep(800);
    await selectValue(page, currencySelect, "EUR");
    await sleep(500);
  }

  const catalogToggle = page.locator('.app-main button[aria-pressed]').first();
  if (await catalogToggle.count()) {
    await bringIntoView(catalogToggle);
    await glide(page, catalogToggle);
    await caption(page, "Javni katalog se uključuje jednim klikom");
    await sleep(950);
  }

  const whatsapp = page.locator(`input[aria-label="${SR["catalog.whatsappPlaceholder"]}"]`).first();
  if (await whatsapp.count()) {
    await bringIntoView(whatsapp);
    await click(page, whatsapp);
    await whatsapp.pressSequentially("+381 64 123 4567", { delay: 35 });
    await sleep(500);
    await caption(page, "WhatsApp, Telegram i Instagram kao kanali poručivanja");
    await sleep(1000);
  }

  const openCatalog = page.getByRole("link", { name: SR["catalog.open"], exact: true }).first();
  if (await openCatalog.count()) {
    await hover(page, openCatalog);
    await sleep(650);
  }

  const catalogCopy = page.locator("button").filter({ hasText: SR["catalog.copyLink"] }).first();
  if (await catalogCopy.count()) {
    await bringIntoView(catalogCopy);
    await click(page, catalogCopy);
    await sleep(450);
    await caption(page, "Link kataloga se kopira jednim klikom");
    await sleep(950);
  }

  const refreshStock = page.getByRole("button", { name: SR["catalog.refreshStock"], exact: true }).first();
  if (await refreshStock.count()) {
    await hover(page, refreshStock);
    await caption(page, "Ručno osvežavanje cena i stanja u katalogu");
    await sleep(900);
  }

  const saveContact = page.getByRole("button", { name: SR["catalog.saveContact"], exact: true }).first();
  if (await saveContact.count()) {
    await hover(page, saveContact);
    await sleep(700);
  }

  const branding = page.getByRole("button", { name: SR["catalog.brandingTitle"], exact: true }).first();
  if (await branding.count()) {
    await click(page, branding);
    await sleep(850);
    await caption(page, "Logo i naslovna slika kataloga");
    const brandingSlots = page.locator(`img[alt="${SR["catalog.logo"]}"], img[alt="${SR["catalog.cover"]}"]`);
    if (await brandingSlots.count()) {
      await glide(page, brandingSlots.first());
    }
    await sleep(1050);
    await click(page, branding);
    await sleep(600);
  }

  const staffSwitch = page.getByRole("switch").first();
  if (await staffSwitch.count()) {
    await bringIntoView(staffSwitch);
    await glide(page, staffSwitch);
    await caption(page, "Pristup zaposlenih javnom katalogu");
    await sleep(950);
  }

  const lowStockAlert = page.locator('.app-main div[style*="--amber-dim"]').first();
  if (await lowStockAlert.count()) {
    await bringIntoView(lowStockAlert);
    await sleep(600);
  }

  const dangerButton = page.getByRole("button", { name: SR["danger.deleteShop"], exact: true }).first();
  if (await dangerButton.count()) {
    await click(page, dangerButton);
    const dialog = page.locator('[role="dialog"]').first();
    if (await dialog.count()) {
      await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
      await caption(page, "Brisanje traži potvrdu naziva radnje");
      await sleep(850);
      const input = dialog.locator("input").first();
      if (await input.count()) {
        await click(page, input);
        await input.pressSequentially("Demo", { delay: 75 });
        await sleep(700);
      }
      await cancelDialog(page, dialog);
    }
  }
  await scrollTop(page);
}

async function sceneAnalytics(page) {
  await nav(page, "/dashboard/analytics", "Analitika");
  await waitForAny(page, [".recharts-surface", ".analytics-stats", "main h1"], 15000);
  await sleep(1600);

  const range90 = page.getByRole("button", { name: SR["analytics.range.90days"], exact: true });
  if (await range90.count()) {
    await click(page, range90);
    await sleep(850);
    await caption(page, "Period od 90 dana");
    await sleep(700);
  }
  const range12 = page.getByRole("button", { name: SR["analytics.range.12months"], exact: true });
  if (await range12.count()) {
    await click(page, range12);
    await sleep(800);
    await caption(page, "Poslednjih 12 meseci");
    await sleep(700);
  }
  const rangeYear = page.getByRole("button", { name: SR["analytics.range.year"], exact: true });
  if (await rangeYear.count()) {
    await click(page, rangeYear);
    await sleep(700);
    const yearSelect = page.locator(`select[aria-label="${SR["analytics.selectYear"]}"]`).first();
    if (await yearSelect.count()) {
      await bringIntoView(yearSelect);
      await sleep(500);
    }
    await caption(page, "Prikaz po izabranoj godini");
    await sleep(800);
  }
  const range30 = page.getByRole("button", { name: SR["analytics.range.30days"], exact: true });
  if (await range30.count()) {
    await click(page, range30);
    await sleep(900);
  }

  const analyticsTiles = page.locator(".analytics-stats").first().locator(":scope > div");
  const tileCount = Math.min(await analyticsTiles.count(), 6);
  for (let i = 0; i < tileCount; i += 1) {
    await glide(page, analyticsTiles.nth(i), { steps: 12, delay: 6 });
    await sleep(220);
  }
  await caption(page, "Promet, marža, zalihe i broj promena stanja");
  await sleep(950);

  const chart = page.locator(".recharts-surface").first();
  if (await chart.count()) {
    await bringIntoView(chart);
    await sleep(500);
    const box = await chart.boundingBox();
    if (box) {
      await glide(page, { x: box.x + box.width * 0.22, y: box.y + box.height * 0.5 }, { steps: 18 });
      for (const fraction of [0.38, 0.52, 0.66]) {
        await page.mouse.move(box.x + box.width * fraction, box.y + box.height * 0.5, { steps: 8 });
        await sleep(280);
      }
    }
    await caption(page, "Prihod po periodu — detalji na hover");
    await sleep(900);
  }

  const revenueHeading = page.getByText(SR["analytics.revenueTitle"], { exact: true }).first();
  if (await revenueHeading.count()) {
    await bringIntoView(revenueHeading);
    await sleep(600);
    await scroll(page, 380);
    await caption(page, "Prihod po periodu i marža");
    await sleep(950);
    const panels = page.locator(".analytics-panels > div");
    const panelCount = Math.min(await panels.count(), 3);
    for (let i = 0; i < panelCount; i += 1) {
      await bringIntoView(panels.nth(i));
      await sleep(750);
    }
    await caption(page, "Najveće promene, nisko stanje i mrtve zalihe");
    await sleep(1000);
    const catalogHeading = page.getByText(SR["analytics.catalogTitle"], { exact: true }).first();
    if (await catalogHeading.count()) {
      await bringIntoView(catalogHeading);
      await caption(page, "Posete, klikovi na kanale i konverzija javnog kataloga");
      await sleep(1000);
    }
  }
}

async function sceneProducts(page) {
  await nav(page, "/dashboard/products", "Artikli");
  await waitForAny(page, [".products-row", ".products-card", ".products-empty"], 15000);
  await sleep(1000);

  const statTiles = page.locator(".products-stat");
  const statTileCount = Math.min(await statTiles.count(), 3);
  for (let i = 0; i < statTileCount; i += 1) {
    await glide(page, statTiles.nth(i), { steps: 12, delay: 6 });
    await sleep(240);
  }
  await caption(page, "Ukupno stanje, kategorije i artikli na niskom stanju");
  await sleep(950);

  const firstName = (await page.locator(".products-name").first().textContent().catch(() => ""))?.trim() ?? "";
  sampleProduct = firstName;
  const search = page.locator(".products-search-input");
  if ((await search.count()) && sampleProduct) {
    await typeInto(page, search, sampleProduct.split(" ").slice(0, 2).join(" "));
    await caption(page, "Pretraga po nazivu ili SKU-u");
    await sleep(800);
    const clearButton = page.locator(".products-search-clear");
    if (await clearButton.count()) {
      await click(page, clearButton);
      await sleep(600);
    }
  }

  const chips = page.locator('.products-chips button[role="tab"]');
  if ((await chips.count()) > 1) {
    await click(page, chips.nth(1));
    await sleep(750);
    await caption(page, "Filter po kategoriji");
    await sleep(650);
    await click(page, chips.first());
    await sleep(550);
  }

  const sort = page.locator(".products-sort").first();
  if (await sort.count()) {
    await selectValue(page, sort, "priceAsc");
    await caption(page, "Sortiranje po ceni i stanju");
    await sleep(750);
    await selectValue(page, sort, "name");
    await sleep(450);
  }

  const viewGrid = page.locator(`button[aria-label="${SR["products.viewGrid"]}"]`).first();
  if (await viewGrid.count()) {
    await click(page, viewGrid);
    await sleep(1000);
    await scroll(page, 300);
    await caption(page, "Mrežni prikaz kataloga");
    await sleep(750);
    const viewList = page.locator(`button[aria-label="${SR["products.viewList"]}"]`).first();
    if (await viewList.count()) await click(page, viewList);
    await sleep(550);
  }

  const pager = page.locator(".list-pagination").first();
  if (await pager.count()) {
    await bringIntoView(pager);
    await sleep(650);
    const pageTwo = pager.getByRole("button", { name: "2", exact: true }).first();
    if (await pageTwo.count()) {
      await click(page, pageTwo);
      await sleep(800);
      await caption(page, "Stranice kataloga sa brojem prikazanih artikala");
      await sleep(850);
      const pageOne = pager.getByRole("button", { name: "1", exact: true }).first();
      if (await pageOne.count()) await click(page, pageOne);
      await sleep(650);
    }
    const loadMore = pager.locator(".list-pagination-more").first();
    if (await loadMore.count()) {
      await click(page, loadMore);
      await sleep(850);
      await caption(page, "Učitavanje još artikala bez promene stranice");
      await sleep(850);
    }
  }
  await scrollTop(page);
  await sleep(500);

  const manage = page.locator(".products-manage-btn").first();
  if (await manage.count()) {
    await click(page, manage);
    await sleep(850);
    await caption(page, "Uređivanje kategorija na svim artiklima");
    const renameInput = page.locator(`input[aria-label="${SR["categories.newName"]}"]`).first();
    if (await renameInput.count()) {
      await bringIntoView(renameInput);
      await sleep(550);
    }
    const closeCategories = page.locator(`button[aria-label="${SR["back"]}"]`).last();
    if (await closeCategories.count()) await click(page, closeCategories);
    await sleep(650);
  }

  const firstRow = page.locator(".products-row").first();
  if (await firstRow.count()) {
    await click(page, firstRow);
    await page.waitForURL("**/dashboard/products/**", { timeout: 15000 }).catch(() => {});
    await sleep(1600);
    await caption(page, "Detalji artikla, varijante i stanje");
    await scroll(page, 420);
    await sleep(650);

    const detailSteppers = page.locator('button[aria-label="-1"], button[aria-label="+1"]');
    const stepCount = Math.min(await detailSteppers.count(), 2);
    for (let i = 0; i < stepCount; i += 1) {
      await hover(page, detailSteppers.nth(i));
      await sleep(380);
    }
    if (stepCount > 0) {
      await caption(page, "Brza korekcija stanja po varijanti");
      await sleep(900);
    }

    const customDelta = page.locator('input[placeholder="n"]').first();
    if (await customDelta.count()) {
      await click(page, customDelta);
      await customDelta.fill("12");
      await sleep(500);
      const plusN = page.getByRole("button", { name: "+n", exact: true }).first();
      if (await plusN.count()) {
        await click(page, plusN);
        const dialog = page.locator('[role="dialog"]').first();
        if (await dialog.count()) {
          await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
          await caption(page, "Velika korekcija stanja traži potvrdu");
          await sleep(850);
          await cancelDialog(page, dialog);
        }
      }
    }

    const deleteButton = page.getByRole("button", { name: SR["delete"], exact: true }).first();
    if (await deleteButton.count()) {
      await click(page, deleteButton);
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.count()) {
        await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        await caption(page, "Brisanje artikla je nepovratno — otkazujemo");
        await sleep(850);
        await cancelDialog(page, dialog);
      }
    }

    const historyHeading = page.getByText(SR["product.history"], { exact: true }).first();
    if (await historyHeading.count()) {
      await bringIntoView(historyHeading);
      await caption(page, "Istorija svake promene stanja");
      await sleep(900);
    }

    const detailPagers = page.locator(".list-pagination");
    const detailPagerCount = Math.min(await detailPagers.count(), 2);
    for (let i = 0; i < detailPagerCount; i += 1) {
      await bringIntoView(detailPagers.nth(i));
      await sleep(550);
    }
    if (detailPagerCount > 0) {
      await caption(page, "Paginacija varijanti i istorije promena");
      await sleep(900);
    }

    const editLink = page.locator('a[href$="/edit"]').first();
    if (await editLink.count()) {
      await click(page, editLink);
      await page.waitForURL("**/edit", { timeout: 15000 }).catch(() => {});
      await sleep(1400);
      await caption(page, "Izmena artikla — bez menjanja podataka");
      await scroll(page, 420);
      await sleep(650);
      const imageTiles = page.locator(".pform-image-tile, .pform-image-add");
      if (await imageTiles.count()) {
        await glide(page, imageTiles.first());
        await caption(page, "Galerija artikla — naslovna slika i redosled");
        await sleep(950);
      }
      const variantsHeading = page.getByRole("heading", { name: SR["product.variants"], exact: true }).first();
      if (await variantsHeading.count()) {
        await bringIntoView(variantsHeading);
        await sleep(650);
      }
      const visibilityToggle = page.locator('.pform-toggle input[type="checkbox"]').first();
      if (await visibilityToggle.count()) {
        await click(page, visibilityToggle);
        await sleep(550);
        await caption(page, "Artikal može biti sakriven iz javnog kataloga");
        await sleep(900);
        await click(page, visibilityToggle);
        await sleep(400);
      }
      const saveButton = page.getByRole("button", { name: SR["product.saveBtn"], exact: true }).first();
      if (await saveButton.count()) {
        await hover(page, saveButton);
        await sleep(750);
      }
      const backToDetail = page.locator(".pform-back").first();
      if (await backToDetail.count()) await click(page, backToDetail);
      await sleep(1300);
    }

    const backToProducts = page.locator('a.pform-back[href="/dashboard/products"]').first();
    if (await backToProducts.count()) {
      await click(page, backToProducts);
    } else {
      await fadeTo(page, `${BASE_URL}/dashboard/products`);
    }
    await sleep(1400);
    await waitForAny(page, [".products-row", ".products-card"], 15000);
    await scrollTop(page);
  }

  const newProduct = page.locator('a[href="/dashboard/products/new"]').first();
  if (!(await newProduct.count())) return;

  await caption(page, "Ručno dodavanje artikla");
  await click(page, newProduct);
  await page.waitForURL("**/dashboard/products/new", { timeout: 15000 }).catch(() => {});
  await waitForAny(page, ["#product-name", ".product-form"], 15000);
  await sleep(1100);

  const nameInput = page.locator("#product-name");
  if (!(await nameInput.count())) return;
  await typeInto(page, nameInput, "Zimska jakna — demo");
  await typeInto(page, page.locator("#product-sku"), `ZJ-${RUN_ID}`);
  const categoryInput = page.locator("#product-category");
  if (await categoryInput.count()) await typeInto(page, categoryInput, "Odeća");

  const addField = page.getByRole("button", { name: SR["product.addManualField"], exact: true }).first();
  if (await addField.count()) {
    await click(page, addField);
    await sleep(700);
    const fieldName = page.locator(`input[aria-label="${SR["product.customFieldName"]}"]`).first();
    if (await fieldName.count()) {
      await click(page, fieldName);
      await fieldName.fill("");
      await fieldName.pressSequentially("Sezona", { delay: 55 });
      await sleep(500);
    }
    await caption(page, "Dodatna polja — ručno ili AI predlogom");
    const suggest = page.getByRole("button", { name: SR["product.suggestFields"], exact: true }).first();
    if (await suggest.count()) {
      await hover(page, suggest);
      await sleep(700);
    } else {
      await sleep(900);
    }
  }

  const imageInput = page.locator('input[type="file"]').first();
  if ((await imageInput.count()) && fs.existsSync(SAMPLE_IMAGE)) {
    await imageInput.setInputFiles(SAMPLE_IMAGE);
    const cropConfirm = page.getByRole("button", { name: SR["cropper.confirm"], exact: true }).first();
    if (await cropConfirm.count()) {
      await cropConfirm.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await caption(page, "Isecanje i priprema slike artikla");
      await sleep(900);
      await click(page, cropConfirm);
      await page.locator(".pform-image-tile").first().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
      await sleep(800);
      await caption(page, "Prva slika je naslovna");
      await sleep(750);
    }
  }

  const variantName = page.getByPlaceholder(SR["product.variantName"]).first();
  if (await variantName.count()) {
    await typeInto(page, variantName, "Crna · M");
    const variantQty = page.getByLabel(SR["product.quantity"], { exact: true }).first();
    if (await variantQty.count()) {
      await click(page, variantQty);
      await variantQty.fill("12");
      await sleep(450);
    }
    const variantSku = page.getByPlaceholder(SR["product.variantSkuPlaceholder"]).first();
    if (await variantSku.count()) {
      await click(page, variantSku);
      await variantSku.fill(`ZJ-${RUN_ID}-M`);
      await sleep(400);
    }
    const addVariant = page.getByRole("button", { name: SR["product.addVariant"], exact: true }).first();
    if (await addVariant.count()) {
      await click(page, addVariant);
      await sleep(650);
      const secondName = page.getByPlaceholder(SR["product.variantName"]).nth(1);
      if (await secondName.count()) {
        await click(page, secondName);
        await secondName.pressSequentially("Plava · L", { delay: 42 });
        const secondQty = page.getByLabel(SR["product.quantity"], { exact: true }).nth(1);
        if (await secondQty.count()) {
          await click(page, secondQty);
          await secondQty.fill("5");
        }
      }
    }
    await caption(page, "Varijante sa sopstvenim stanjem");
    await sleep(900);
  }

  const minStock = page.locator(`input[aria-label="${SR["product.minStock"]}"]`).first();
  if (await minStock.count()) {
    await bringIntoView(minStock);
    await click(page, minStock);
    await minStock.fill("3");
    await sleep(450);
    await caption(page, "Minimalno stanje pokreće upozorenje pre nego što ponestane");
    await sleep(950);
  }

  const priceFields = [
    ["#product-cost-price", "24,90"],
    ["#product-sale-price", "49,99"],
    ["#product-compare-at-price", "69,99"],
    ["#product-supplier", "Demo dobavljač"],
    ["#product-supplier-contact", "@demo_dobavljac"],
  ];
  for (const [selector, value] of priceFields) {
    const input = page.locator(selector).first();
    if (await input.count()) {
      await click(page, input);
      await input.fill(value);
      await sleep(280);
    }
  }
  await caption(page, "Nabavna, prodajna i stara cena sa dobavljačem");
  await sleep(900);

  const createButton = page.getByRole("button", { name: SR["product.createBtn"], exact: true }).first();
  if (await createButton.count()) {
    await bringIntoView(createButton);
    await glide(page, createButton);
    await sleep(650);
    await caption(page, "Sve je spremno — artikal se čuva jednim klikom");
    await sleep(1200);
  }
  await fadeTo(page, `${BASE_URL}/dashboard/products`);
  await waitForAny(page, [".products-row", ".products-card"], 15000);
  await sleep(800);
}

async function sceneReceive(page) {
  await nav(page, "/dashboard/receive", "Prijem robe");
  await waitForAny(page, ["input.input", "main h1"], 12000);
  await sleep(850);

  const scanButton = page.getByRole("button", { name: SR["receive.scan"], exact: true }).first();
  if (await scanButton.count()) {
    await click(page, scanButton);
    // The scanner is lazy-loaded, so it may not be in the DOM on the first tick.
    const scanner = page.locator('div[style*="z-index: 1000"]').first();
    await scanner.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (await scanner.isVisible().catch(() => false)) {
      await caption(page, "Skeniranje barkoda kamerom");
      await sleep(1600);
      const closeScanner = scanner.locator("button").first();
      if (await closeScanner.count()) {
        await click(page, closeScanner);
        await scanner.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
      }
      if (await scanner.isVisible().catch(() => false)) {
        // Backdrop click: the overlay closes only when the target is the root.
        const box = await scanner.boundingBox();
        if (box) await page.mouse.click(box.x + 10, box.y + 10);
        await scanner.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
      }
      await sleep(700);
    }
  }

  const search = page.locator(`input[placeholder="${SR["receive.searchAdd"]}"]`).first();
  if ((await search.count()) && sampleProduct) {
    await typeInto(page, search, sampleProduct.split(" ").slice(0, 2).join(" "));
    const suggestion = page.locator('main div[style*="z-index: 100"] button').first();
    if (await suggestion.count()) {
      await click(page, suggestion);
      await sleep(1200);
      const variantSelect = page.locator(".receipt-line select").first();
      if (await variantSelect.count()) {
        await glide(page, variantSelect);
        await sleep(600);
      }
      const controls = page.locator(".receipt-line .receipt-controls button");
      if ((await controls.count()) >= 2) {
        await click(page, controls.nth(1));
        await sleep(450);
        await click(page, controls.nth(0));
        await sleep(450);
      }
      const qty = page.locator('.receipt-line .receipt-controls input[type="number"]').first();
      if (await qty.count()) {
        await click(page, qty);
        await qty.fill("3");
        await sleep(500);
      }
      const removeLine = page.locator(`.receipt-line button[aria-label="${SR["receive.removeLine"]}"]`).first();
      if (await removeLine.count()) {
        await hover(page, removeLine);
        await sleep(550);
      }
      await caption(page, "Pretraga, skeniranje, količina i uklanjanje stavke");
      await sleep(950);
      const confirmReceipt = page.getByRole("button", { name: SR["receive.confirm"], exact: true });
      if (await confirmReceipt.count()) {
        await bringIntoView(confirmReceipt);
        await glide(page, confirmReceipt);
        await sleep(650);
        await caption(page, "Potvrda prijema odmah ažurira stanje");
        await sleep(1200);
      }
    }
  }
}

async function sceneSales(page) {
  await nav(page, "/dashboard/sales", "Prodaja");
  await waitForAny(page, ["main h1", "input.input"], 12000);
  await sleep(850);

  const scanSale = page.getByRole("button", { name: SR["receive.scan"], exact: true }).first();
  if (await scanSale.count()) {
    await click(page, scanSale);
    const scanner = page.locator('div[style*="z-index: 1000"]').first();
    await scanner.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    if (await scanner.isVisible().catch(() => false)) {
      await caption(page, "Skeniranje barkoda pri prodaji");
      await sleep(1600);
      const closeScanner = scanner.locator("button").first();
      if (await closeScanner.count()) await click(page, closeScanner);
      await sleep(650);
    }
  }

  const search = page.locator(`input[placeholder="${SR["sales.searchAdd"]}"]`).first();
  if ((await search.count()) && sampleProduct) {
    await typeInto(page, search, sampleProduct.split(" ").slice(0, 2).join(" "));
    const suggestion = page.locator('main div[style*="z-index: 100"] button').first();
    if (await suggestion.count()) {
      await click(page, suggestion);
      await sleep(1300);
      await caption(page, "Prodaja sa varijantom, kupcem i kanalom");
      const variant = page.locator(".receipt-line select").first();
      if (await variant.count()) {
        await glide(page, variant);
        await sleep(500);
      }
      const plus = page.locator(".receipt-line .receipt-controls button").nth(1);
      const minus = page.locator(".receipt-line .receipt-controls button").nth(0);
      if (await plus.count()) {
        await click(page, plus);
        await sleep(450);
        await click(page, minus);
        await sleep(450);
      }
      const unitPrice = page.locator(`input[aria-label^="${SR["sales.unitPrice"]}"]`).first();
      if (await unitPrice.count()) {
        await click(page, unitPrice);
        await unitPrice.fill("1290");
        await sleep(500);
        await caption(page, "Cena po komadu se može prepisati na mestu");
        await sleep(900);
      }
      const channel = page.locator(`select[aria-label="${SR["sales.channel"]}"]`).first();
      if (await channel.count()) {
        await selectValue(page, channel, "store");
        await sleep(650);
        await selectValue(page, channel, "instagram");
        await sleep(550);
      }
      const buyer = page.locator(`input[placeholder="${SR["sales.buyerNamePlaceholder"]}"]`).first();
      if (await buyer.count()) await typeInto(page, buyer, "Demo kupac");
      const contact = page.locator(`input[placeholder="${SR["sales.instagramPlaceholder"]}"]`).first();
      if (await contact.count()) await typeInto(page, contact, "@demo_kupac");
      const note = page.locator(`input[placeholder="${SR["sales.notePlaceholder"]}"]`).first();
      if (await note.count()) await typeInto(page, note, "Demo prikaz prodaje");
      const removeSaleLine = page.locator(`.receipt-line button[aria-label="${SR["receive.removeLine"]}"]`).first();
      if (await removeSaleLine.count()) {
        await hover(page, removeSaleLine);
        await sleep(550);
      }
      const customerSelect = page.locator(`select[aria-label="${SR["customers.pick"]}"]`).first();
      if (await customerSelect.count()) {
        await bringIntoView(customerSelect);
        await glide(page, customerSelect);
        await sleep(550);
        const quickAdd = page.getByRole("button", { name: SR["customers.quickAdd"], exact: true }).first();
        if (await quickAdd.count()) {
          await click(page, quickAdd);
          await sleep(650);
          const pickerSearch = page.locator(`input[aria-label="${SR["customers.searchPlaceholder"]}"]`).last();
          if (await pickerSearch.count()) {
            await click(page, pickerSearch);
            await pickerSearch.pressSequentially("Ana", { delay: 70 });
            await sleep(500);
          }
          await caption(page, "Povezivanje kupca ili brzo dodavanje");
          await sleep(850);
          await click(page, quickAdd);
          await sleep(400);
        }
      }
    }
  }

  const historyHeading = page.getByRole("heading", { name: SR["sales.history"], exact: true }).first();
  if (await historyHeading.count()) {
    await bringIntoView(historyHeading);
    await sleep(700);
    const saleCard = page
      .locator("main .glass")
      .filter({ has: page.getByRole("button", { name: SR["sales.storno"], exact: true }) })
      .first();
    if (await saleCard.count()) {
      const storno = saleCard.getByRole("button", { name: SR["sales.storno"], exact: true }).first();
      await click(page, storno);
      await sleep(600);
      await caption(page, "Storno anulira prodaju i vraća robu na stanje");
      await sleep(950);
      const keepSale = saleCard.getByRole("button", { name: SR["cancel"], exact: true }).first();
      if (await keepSale.count()) await click(page, keepSale);
      await sleep(600);
    }
    await caption(page, "Istorija prodaja, kanali i kupci");
    await sleep(900);
    const historyPager = page.locator(".list-pagination").first();
    if (await historyPager.count()) {
      const more = historyPager.locator(".list-pagination-more").first();
      if (await more.count()) {
        await bringIntoView(more);
        await click(page, more);
        await sleep(750);
        await caption(page, "Učitavanje starijih prodaja");
        await sleep(900);
      }
    }
  }

  const confirmSale = page.getByRole("button", { name: SR["sales.confirm"], exact: true });
  if (await confirmSale.count()) {
    await bringIntoView(confirmSale);
    await glide(page, confirmSale);
    await sleep(650);
    await caption(page, "Prodaja se evidentira jednim klikom");
    await sleep(1300);
  }
}

async function sceneOrders(page) {
  await nav(page, "/dashboard/orders", "Porudžbine i poruke kupaca");
  await waitForAny(page, ["input[type='search']", "main h1"], 15000);
  await sleep(1200);

  const summaryTiles = page.locator(`section[aria-label="${SR["orders.title"]}"]`).first().locator(":scope > div");
  const summaryCount = Math.min(await summaryTiles.count(), 5);
  for (let i = 0; i < summaryCount; i += 1) {
    await glide(page, summaryTiles.nth(i), { steps: 12, delay: 6 });
    await sleep(230);
  }
  if (summaryCount > 0) {
    await caption(page, "Broj novih, aktivnih i isporučenih porudžbina");
    await sleep(950);
  }

  const filterGroup = page.getByRole("group", { name: SR["orders.title"] }).first();
  if (await filterGroup.count()) {
    for (const [filterKey, label, note] of [
      ["open", SR["orders.filterOpen"], "Sve aktivne porudžbine"],
      ["new", SR["orders.status.new"], "Nove porudžbine"],
      ["confirmed", SR["orders.status.confirmed"], "Potvrđene porudžbine"],
      ["fulfilling", SR["orders.status.fulfilling"], "Porudžbine u isporuci"],
      ["fulfilled", SR["orders.status.fulfilled"], "Isporučene porudžbine"],
      ["cancelled", SR["orders.status.cancelled"], "Otkazane porudžbine"],
      ["all", SR["all"], "Svi statusi sa brojevima"],
    ]) {
      const filter = filterGroup.getByRole("button").filter({ hasText: label }).first();
      if (await filter.count()) {
        await click(page, filter);
        await caption(page, note);
        await sleep(750);
      }
    }
  }

  const search = page.locator('input[type="search"]').first();
  if (await search.count()) {
    await typeInto(page, search, sampleProduct ? sampleProduct.split(" ")[0] : "demo");
    await sleep(750);
    await search.fill("");
    await sleep(500);
  }

  const firstOrder = page.locator("article.glass").first();
  if (await firstOrder.count()) {
    await bringIntoView(firstOrder);
    await glide(page, firstOrder);
    await sleep(650);
    await caption(page, "Status, kupac i stavke porudžbine");
    await sleep(900);

    const cancelOrder = firstOrder.getByRole("button", { name: SR["orders.cancelAction"], exact: true }).first();
    if (await cancelOrder.count()) {
      await click(page, cancelOrder);
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.count()) {
        await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
        await caption(page, "Otkazivanje porudžbine traži potvrdu");
        await sleep(850);
        await cancelDialog(page, dialog);
      }
    }

    const statusButton = firstOrder
      .getByRole("button", { name: new RegExp(`^(${ORDER_ACTION_LABELS.join("|")})`) })
      .first();
    if (await statusButton.count()) {
      await hover(page, statusButton);
      await caption(page, "Obrada: potvrda, delimična isporuka i skinuto stanje");
      await sleep(950);
    }

    const orderChat = firstOrder.locator("button[aria-expanded]").first();
    if (await orderChat.count()) {
      await click(page, orderChat);
      await sleep(1400);
      await caption(page, "Razgovor sa kupcem o porudžbini");
      await sleep(1000);
      const chatInput = firstOrder.locator(`textarea[aria-label="${SR["chat.messagePlaceholder"]}"]`).first();
      if (await chatInput.count()) {
        await click(page, chatInput);
        await chatInput.pressSequentially("Da li vam odgovara dostava sutra ujutru?", { delay: 32 });
        await sleep(800);
        await caption(page, "Odgovor se šalje iz istog razgovora");
        await sleep(1000);
      }
      await click(page, orderChat);
      await sleep(500);
    }

    const attachCustomer = firstOrder.locator(`select[aria-label="${SR["customers.attach"]}"]`).first();
    if (await attachCustomer.count()) {
      await bringIntoView(attachCustomer);
      await glide(page, attachCustomer);
      await sleep(650);
    }
  }

  const partialOrder = page
    .locator("article.glass")
    .filter({ has: page.locator('input[type="checkbox"]') })
    .first();
  if (await partialOrder.count()) {
    await bringIntoView(partialOrder);
    await glide(page, partialOrder);
    await sleep(650);
    await caption(page, "Parcijalna isporuka — birate stavke koje šaljete sada");
    await sleep(1100);

    const lineBoxes = partialOrder.locator('input[type="checkbox"]:not([disabled])');
    const lineBoxCount = await lineBoxes.count();
    const fulfillButton = partialOrder.locator("button.btn-primary").first();

    if (lineBoxCount > 1) {
      await click(page, lineBoxes.first());
      await sleep(850);
      await caption(page, "Ostatak ostaje u porudžbini za kasniju isporuku");
      await sleep(1100);
    }
    if (await fulfillButton.count()) {
      await hover(page, fulfillButton);
      await caption(page, "Dugme prati izbor i broj preostalih stavki");
      await sleep(1000);
    }
    if (lineBoxCount > 1) {
      await click(page, lineBoxes.first());
      await sleep(450);
    }

    const fulfillmentProgress = partialOrder.locator('[role="progressbar"]').first();
    if (await fulfillmentProgress.count()) {
      await bringIntoView(fulfillmentProgress);
      const done = await fulfillmentProgress.getAttribute("aria-valuenow").catch(() => null);
      await glide(page, fulfillmentProgress);
      await caption(page, done ? `Isporuka u toku — ${done}% obrađeno` : "Isporuka u toku — napredak po stavkama");
      await sleep(1100);
    }
  }

  const conversations = page.locator(`section[aria-label="${SR["chat.shopConversations"]}"]`).first();
  if (await conversations.count()) {
    await bringIntoView(conversations);
    const conversation = conversations.locator("article").first();
    if (await conversation.count()) {
      const toggle = conversation.getByRole("button", { name: SR["chat.openConversation"], exact: true }).first();
      if (await toggle.count()) {
        await click(page, toggle);
        await sleep(1300);
        await caption(page, "Poruke kupaca pre porudžbine");
        await sleep(1000);
        const chatInput = conversation.locator(`textarea[aria-label="${SR["chat.messagePlaceholder"]}"]`).first();
        if (await chatInput.count()) {
          await click(page, chatInput);
          await chatInput.pressSequentially("Hvala na pitanju! Artikal je dostupan.", { delay: 30 });
          await sleep(750);
        }
        const closeToggle = conversation.getByRole("button", { name: SR["chat.closeConversation"], exact: true }).first();
        if (await closeToggle.count()) await click(page, closeToggle);
        await sleep(500);
      }
      const removeConversation = conversation.locator(`button[aria-label="${SR["chat.deleteConversation"]}"]`).first();
      if (await removeConversation.count()) {
        await click(page, removeConversation);
        const dialog = page.locator('[role="dialog"]').first();
        if (await dialog.count()) {
          await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
          await caption(page, "Uklanjanje razgovora samo iz vašeg prikaza");
          await sleep(850);
          await cancelDialog(page, dialog);
        }
      }
    } else {
      await caption(page, "Razgovori sa kupcima pre porudžbine");
      await sleep(800);
    }
  }
  const ordersPager = page.locator(".list-pagination").first();
  if (await ordersPager.count()) {
    const moreOrders = ordersPager.locator(".list-pagination-more").first();
    if (await moreOrders.count()) {
      await bringIntoView(moreOrders);
      await click(page, moreOrders);
      await sleep(800);
      await caption(page, "Učitavanje starijih porudžbina");
      await sleep(900);
    }
  }
  await scroll(page, 320);
}

async function sceneCustomers(page) {
  await nav(page, "/dashboard/customers", "Kupci i istorija kupovine");
  await waitForAny(page, ["main h1", "a[href^='/dashboard/customers/']"], 15000);
  await sleep(1100);

  for (const labelKey of ["customers.totalCustomers", "customers.newCustomers", "customers.linkedSales", "customers.totalSpent"]) {
    const tile = page.locator(".glass").filter({ hasText: SR[labelKey] }).first();
    if (await tile.count()) {
      await glide(page, tile, { steps: 12, delay: 6 });
      await sleep(240);
    }
  }
  await caption(page, "Ukupan broj kupaca, novi kupci i potrošnja");
  await sleep(950);

  const search = page.locator(`input[aria-label="${SR["customers.searchPlaceholder"]}"]`).first();
  const firstCustomer = page.locator("a[href^='/dashboard/customers/']").first();
  let firstCustomerName = "";
  let featuredCustomer = "";
  if (await firstCustomer.count()) {
    firstCustomerName = (await firstCustomer.locator("p").first().textContent().catch(() => ""))?.trim() ?? "";
  }
  if ((await search.count()) && firstCustomerName) {
    await typeInto(page, search, firstCustomerName.split(" ")[0]);
    await caption(page, "Pretraga po imenu, kontaktu i oznaci");
    await sleep(800);
    await search.fill("");
    await sleep(500);
  }

  const sort = page.locator(`select[aria-label="${SR["products.sortLabel"]}"]`).first();
  if (await sort.count()) {
    await selectValue(page, sort, "spent");
    await sleep(450);
    featuredCustomer = (await page.locator("a[href^='/dashboard/customers/']").first().getAttribute("href").catch(() => "")) ?? "";
    await caption(page, "Sortiranje po potrošnji i datumu");
    await sleep(750);
    await selectValue(page, sort, "name");
    await sleep(450);
  }

  const tagButtons = page.locator("button[aria-pressed]").filter({ hasNotText: /^\s*$/ });
  const tagCount = await tagButtons.count();
  if (tagCount > 1) {
    await click(page, tagButtons.nth(1));
    await sleep(750);
    await caption(page, "Filter po oznakama kupaca");
    await sleep(650);
    await click(page, tagButtons.first());
    await sleep(500);
  }

  const customerPager = page.locator(".list-pagination").first();
  if (await customerPager.count()) {
    await bringIntoView(customerPager);
    await sleep(650);
    const moreCustomers = customerPager.locator(".list-pagination-more").first();
    if (await moreCustomers.count()) {
      await click(page, moreCustomers);
      await sleep(800);
      await caption(page, "Učitavanje još kupaca");
      await sleep(900);
    }
  }
  await scrollTop(page);
  await sleep(500);

  const newCustomer = page.getByRole("button", { name: SR["customers.new"], exact: true }).first();
  if (await newCustomer.count()) {
    await click(page, newCustomer);
    await sleep(850);
    await caption(page, "Novi kupac — kontakt, email, oznake i beleška");
    const name = page.locator("#customer-name").first();
    if (await name.count()) {
      await click(page, name);
      await name.fill("");
      await name.pressSequentially(`Demo kupac ${RUN_ID}`, { delay: 40 });
    }
    const contact = page.locator("#customer-contact").first();
    if (await contact.count()) {
      await click(page, contact);
      await contact.pressSequentially("+381 64 555 0100", { delay: 35 });
    }
    const email = page.locator("#customer-email").first();
    if (await email.count()) {
      await click(page, email);
      await email.pressSequentially("demo@example.com", { delay: 30 });
    }
    const tags = page.locator("#customer-tags").first();
    if (await tags.count()) {
      await click(page, tags);
      await tags.pressSequentially("vip, demo", { delay: 45 });
      await sleep(600);
      const parsedTag = page.locator('form button[title="' + SR["customers.removeTag"] + '"]').first();
      if (await parsedTag.count()) {
        await click(page, parsedTag);
        await sleep(450);
      }
    }
    const note = page.locator("#customer-note").first();
    if (await note.count()) {
      await click(page, note);
      await note.pressSequentially("Preferira dostavu ujutru.", { delay: 30 });
    }
    await caption(page, "Oznake se dodaju i uklanjaju jednim klikom");
    await sleep(950);
    const cancel = page.getByRole("button", { name: SR["cancel"], exact: true }).first();
    if (await cancel.count()) await click(page, cancel);
    await sleep(700);
  }

  const profileLink = featuredCustomer
    ? page.locator(`a[href="${featuredCustomer}"]`).first()
    : firstCustomer;
  if (await profileLink.count()) {
    await click(page, profileLink);
    await page.waitForURL("**/dashboard/customers/**", { timeout: 15000 }).catch(() => {});
    await sleep(1500);
    await caption(page, "Profil kupca, kontakt i istorija kupovine");
    const edit = page.getByRole("button", { name: SR["edit"], exact: true }).first();
    if (await edit.count()) {
      await click(page, edit);
      await sleep(750);
      await caption(page, "Izmena podataka kupca");
      const save = page.getByRole("button", { name: SR["save"], exact: true }).first();
      if (await save.count()) {
        await hover(page, save);
        await sleep(600);
      }
      const cancel = page.getByRole("button", { name: SR["cancel"], exact: true }).first();
      if (await cancel.count()) await click(page, cancel);
      await sleep(600);
    }
    const deleteCustomer = page.getByRole("button", { name: SR["delete"], exact: true }).first();
    if (await deleteCustomer.count()) {
      await hover(page, deleteCustomer);
      await caption(page, "Brisanje kupca je trajno — ne potvrđujemo ga");
      await sleep(900);
    }

    for (const labelKey of ["customers.averagePurchase", "customers.lastPurchase"]) {
      const tile = page.locator(".glass").filter({ hasText: SR[labelKey] }).first();
      if (await tile.count()) {
        await glide(page, tile, { steps: 14, delay: 7 });
        await sleep(350);
      }
    }
    await caption(page, "Prosečna kupovina i datum poslednje kupovine");
    await sleep(1000);

    const favoritesHeading = page.getByRole("heading", { name: SR["customers.favorites.title"], exact: true }).first();
    if (await favoritesHeading.count()) {
      await bringIntoView(favoritesHeading);
      await caption(page, "Omiljeni artikli — količina, potrošnja i udeo");
      await sleep(1050);
      const favoritesSection = favoritesHeading.locator("xpath=..");
      const favoriteRow = favoritesSection.locator("li").first();
      if (await favoriteRow.count()) {
        await glide(page, favoriteRow);
        await sleep(1000);
      }
    }

    const activity = page.getByRole("heading", { name: SR["customers.activity.title"], exact: true }).first();
    if (await activity.count()) {
      await bringIntoView(activity);
      await sleep(700);
    }
    await scroll(page, 420);
    await sleep(700);
    const back = page.locator('a.pform-back[href="/dashboard/customers"]').first();
    if (await back.count()) await click(page, back);
    await sleep(1300);
    await scrollTop(page);
  }
}

async function demoCatalogFilters(page) {
  const sidebar = page.locator(".cat-sidebar-filters").first();
  if (!(await sidebar.count())) return;

  await bringIntoView(sidebar);
  await caption(page, "Filteri kataloga — dostupnost i cena");
  await sleep(850);

  const stockToggle = sidebar.locator(".cat-stock-toggle").first();
  if (await stockToggle.count()) {
    await click(page, stockToggle);
    await sleep(850);
    await caption(page, "„Samo dostupno“ odmah skriva artikle bez zaliha");
    await sleep(1000);
  }

  const priceInputs = sidebar.locator(".cat-price-input");
  if ((await priceInputs.count()) >= 2) {
    await typeInto(page, priceInputs.nth(0), "500");
    await typeInto(page, priceInputs.nth(1), "3000");
    await caption(page, "Opseg cene — od 500 do 3.000");
    await sleep(1000);
  }

  const clearFilters = page.locator(".cat-clear-filters").first();
  if (await clearFilters.count()) {
    await hover(page, clearFilters);
    await caption(page, "Svi aktivni filteri se čiste jednim klikom");
    await sleep(950);
    await click(page, clearFilters);
    await sleep(800);
  }

  // A lower bound above every price empties the grid; the empty state offers a
  // one-click way back, which is worth showing on camera.
  if ((await priceInputs.count()) >= 2) {
    await typeInto(page, priceInputs.nth(0), "999999");
    const empty = page.locator(".cat-empty").first();
    await empty.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    await bringIntoView(empty);
    await caption(page, "Prazno stanje objašnjava filter i nudi povratak");
    await sleep(1100);
    const reset = empty.locator(".cat-empty-action").first();
    if (await reset.count()) {
      await click(page, reset);
      await sleep(800);
      await caption(page, "Katalog je ponovo kompletan");
      await sleep(900);
    }
  }
  await scrollTop(page);
}

async function sceneMobileFilters(page) {
  if (!SHOP_ID) return;
  cursor = { x: MOBILE_VIEWPORT.width / 2, y: MOBILE_VIEWPORT.height / 2 };
  await page.goto(`${BASE_URL}/catalog/${SHOP_ID}`, { waitUntil: "domcontentloaded" });
  const hero = page.locator(".cat-hero-title").first();
  await hero.waitFor({ state: "visible", timeout: 30000 });
  await sleep(1600);
  await caption(page, "Javni katalog na telefonu");
  await glide(page, hero);
  await sleep(800);

  const trigger = page.locator(".cat-filter-trigger").first();
  if (!(await trigger.count())) return;
  await click(page, trigger);
  const sheet = page.locator(".cat-filter-sheet").first();
  await sheet.waitFor({ state: "visible", timeout: 10000 });
  await sleep(900);
  await caption(page, "Filter panel — dostupnost i cena");
  await sleep(950);

  const stock = sheet.locator(".cat-stock-toggle").first();
  if (await stock.count()) {
    await click(page, stock);
    await sleep(700);
  }
  const inputs = sheet.locator(".cat-price-input");
  if ((await inputs.count()) >= 2) {
    await typeInto(page, inputs.nth(0), "500");
    await typeInto(page, inputs.nth(1), "3000");
    await caption(page, "Opseg cene bez napuštanja panela");
    await sleep(1000);
  }
  const apply = page.locator(".cat-filter-apply").first();
  if (await apply.count()) {
    await click(page, apply);
    await sleep(900);
  }
  await caption(page, "Filteri se primenjuju jednim dodirom");
  await sleep(1000);

  const chip = page.locator(".cat-filter-chip").first();
  if (await chip.count()) {
    await hover(page, chip);
    await sleep(700);
    await click(page, chip);
    await sleep(750);
    await caption(page, "Aktivni filter se uklanja čipom");
    await sleep(950);
  }

  await click(page, trigger);
  await sheet.waitFor({ state: "visible", timeout: 10000 });
  await sleep(700);
  const clear = sheet.locator(".cat-filter-clear").first();
  if ((await clear.count()) && !(await clear.isDisabled())) {
    await hover(page, clear);
    await caption(page, "Jedan klik čisti sve filtere");
    await sleep(950);
    await click(page, clear);
    await sleep(550);
  }
  const applyAgain = page.locator(".cat-filter-apply").first();
  if (await applyAgain.count()) {
    await click(page, applyAgain);
    await sleep(900);
  }
  await caption(page, "Spremno za svaki telefon");
  await sleep(1300);
}

async function sceneCatalog(page) {
  if (SKIP_CATALOG || !SHOP_ID) {
    await fadeTo(page, `${BASE_URL}/dashboard`);
    await waitForApp(page);
    await sleep(800);
    return;
  }

  await caption(page, "Javni katalog");
  await fadeTo(page, `${BASE_URL}/catalog/${SHOP_ID}`);
  const hero = page.locator(".cat-hero-title").first();
  if (!(await hero.count())) return;
  await hero.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await sleep(1800);
  await glide(page, hero);
  await sleep(650);
  await caption(page, "Kupac pretražuje i poručuje sam");
  await sleep(900);

  const themeLight = page.locator(`.cat-hero button[aria-label="${SR["theme.switchToLight"]}"]`).first();
  if (await themeLight.count()) {
    await click(page, themeLight);
    await sleep(900);
    await caption(page, "Katalog podržava svetlu i tamnu temu");
    await sleep(750);
    const themeDark = page.locator(`.cat-hero button[aria-label="${SR["theme.switchToDark"]}"]`).first();
    if (await themeDark.count()) await click(page, themeDark);
    await sleep(600);
  }

  const categories = page.locator(".cat-category");
  if ((await categories.count()) > 1) {
    await click(page, categories.nth(1));
    await sleep(750);
    await caption(page, "Filter po kategorijama");
    await sleep(650);
    await click(page, categories.first());
    await sleep(500);
  }

  const firstCardName = (await page.locator(".cat-card-name").first().textContent().catch(() => ""))?.trim() ?? "";
  const search = page.locator(".cat-search").first();
  if ((await search.count()) && firstCardName) {
    await typeInto(page, search, firstCardName.split(" ")[0]);
    await sleep(700);
    const clear = page.locator(".cat-search-clear").first();
    if (await clear.count()) await click(page, clear);
    await sleep(500);
  }

  const sort = page.locator(".cat-sort select").first();
  if (await sort.count()) {
    await selectValue(page, sort, "priceAsc");
    await caption(page, "Sortiranje po ceni i nazivu");
    await sleep(700);
    await selectValue(page, sort, "name");
    await sleep(400);
  }

  await demoCatalogFilters(page);

  const inStockCard = page.locator(".cat-card:has(.cat-card-add:not([disabled])) .cat-card-hit").first();
  const card = (await inStockCard.count()) ? inStockCard : page.locator(".cat-card-hit").first();
  if (await card.count()) {
    await click(page, card);
    await sleep(1200);
    const modal = page.locator(".cat-modal").first();
    if (await modal.count()) {
      await caption(page, "Detalji artikla, varijante i dodatna polja");
      await sleep(900);
      const share = page.locator(".cat-modal-share").first();
      if (await share.count()) {
        await click(page, share);
        await sleep(500);
        const toast = page.locator(".cat-toast[data-visible]").first();
        await toast.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
        if (await toast.count()) {
          await caption(page, "Link artikla se kopira za deljenje");
          await sleep(1200);
        }
      }
      const modalBody = page.locator(".cat-modal-body").first();
      if (await modalBody.count()) {
        await modalBody.evaluate((el) => el.scrollTo({ top: el.scrollHeight })).catch(() => {});
        await sleep(650);
      }
      const close = page.locator(".cat-modal-close").first();
      if (await close.count()) await click(page, close);
      await sleep(700);
    }
  }

  await scroll(page, 560, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.62 } });
  await caption(page, "Katalog je spreman za deljenje na mrežama");
  await sleep(850);
  await scroll(page, 520, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.62 } });
  await caption(page, "Politike privatnosti, kolačića i uslovi korišćenja");
  await sleep(850);
}

async function sceneCustomerCatalog(page) {
  await page.goto(`${BASE_URL}/catalog/${SHOP_ID}`, { waitUntil: "domcontentloaded" });
  const hero = page.locator(".cat-hero-title").first();
  await hero.waitFor({ state: "visible", timeout: 30000 });
  await sleep(1700);
  await caption(page, "Kupac otvara javni katalog prodavnice");
  await glide(page, hero);
  await sleep(800);

  const cookieRegion = page.locator(`div[role="region"][aria-label="${SR["cookies.title"]}"]`).first();
  await cookieRegion.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await cookieRegion.count()) {
    const cookieOk = cookieRegion.locator("button").first();
    if (await cookieOk.count()) {
      await click(page, cookieOk);
      await caption(page, "Obaveštenje o kolačićima — bez praćenja");
      await sleep(1000);
    }
  }

  const askShop = page.locator(".cat-ask-shop").first();
  if (await askShop.count()) {
    await hover(page, askShop);
    await caption(page, "Kupac može da pita prodavnicu pre kupovine");
    await sleep(950);
  }

  const channels = page.locator(".cat-channel");
  for (let i = 0; i < Math.min(await channels.count(), 3); i += 1) {
    await hover(page, channels.nth(i));
    await sleep(500);
  }
  if (await channels.count()) {
    await caption(page, "Poručivanje i preko WhatsApp-a, Telegrama ili Instagrama");
    await sleep(1000);
  }

  const themeToggle = page
    .locator(`.cat-hero button[aria-label="${SR["theme.switchToLight"]}"], .cat-hero button[aria-label="${SR["theme.switchToDark"]}"]`)
    .first();
  if (await themeToggle.count()) {
    await click(page, themeToggle);
    await sleep(900);
    await caption(page, "Kupac bira svetlu ili tamnu temu");
    await sleep(850);
    await click(page, themeToggle).catch(() => {});
    await sleep(600);
  }

  const categories = page.locator(".cat-category");
  if ((await categories.count()) > 1) {
    await click(page, categories.nth(1));
    await sleep(750);
    await caption(page, "Kategorije sa brojem artikala");
    await sleep(700);
    await click(page, categories.first());
    await sleep(500);
  }

  const firstCardName = (await page.locator(".cat-card-name").first().textContent().catch(() => ""))?.trim() ?? "";
  const search = page.locator(".cat-search").first();
  if ((await search.count()) && firstCardName) {
    await typeInto(page, search, firstCardName.split(" ")[0]);
    await caption(page, "Pretraga po nazivu, varijanti i dodatnim poljima");
    await sleep(800);
    const clear = page.locator(".cat-search-clear").first();
    if (await clear.count()) await click(page, clear);
    await sleep(500);
  }

  const sort = page.locator(".cat-sort select").first();
  if (await sort.count()) {
    await selectValue(page, sort, "priceAsc");
    await caption(page, "Sortiranje po ceni i nazivu");
    await sleep(800);
    await selectValue(page, sort, "name");
    await sleep(400);
  }

  await demoCatalogFilters(page);

  const inStockCard = page.locator(".cat-card:has(.cat-card-add:not([disabled])) .cat-card-hit").first();
  const card = (await inStockCard.count()) ? inStockCard : page.locator(".cat-card-hit").first();
  if (await card.count()) {
    await click(page, card);
    await sleep(1200);
    const modal = page.locator(".cat-modal").first();
    if (await modal.count()) {
      await caption(page, "Galerija, varijante, dodatna polja i cena");
      await sleep(900);
      const nextImage = modal.locator('.cat-modal-arrow[data-side="right"]').first();
      if (await nextImage.count()) {
        await click(page, nextImage);
        await sleep(800);
      }
      const share = modal.locator(".cat-modal-share").first();
      if (await share.count()) {
        await click(page, share);
        await sleep(400);
        const toast = page.locator(".cat-toast[data-visible]").first();
        await toast.waitFor({ state: "visible", timeout: 2500 }).catch(() => {});
        if (await toast.count()) {
          await caption(page, "Link artikla se kopira za deljenje");
          await sleep(1200);
        }
      }
      const variant = modal.locator(".cat-variant:not([disabled])").first();
      if (await variant.count()) {
        await click(page, variant);
        await sleep(550);
        await caption(page, "Kupac bira varijantu koja je na stanju");
        await sleep(800);
      }
      const plus = modal.locator(`.cat-stepper button[aria-label="${SR["catalog.increase"]}"]`).first();
      if (await plus.count()) {
        await click(page, plus);
        await sleep(380);
        await click(page, plus);
        await sleep(450);
      }
      const askProduct = modal.locator(".cat-modal-ask").first();
      if (await askProduct.count()) {
        await hover(page, askProduct);
        await sleep(650);
      }
      const modalBody = modal.locator(".cat-modal-body").first();
      if (await modalBody.count()) {
        await modalBody.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })).catch(() => {});
        await sleep(700);
      }
      const add = modal.locator(".cat-add-btn").first();
      const canAdd = (await add.count()) > 0 && !(await add.isDisabled().catch(() => true));
      if (canAdd) {
        await click(page, add);
        await sleep(1000);
      } else {
        const close = modal.locator(".cat-modal-close").first();
        if (await close.count()) await click(page, close);
        await sleep(650);
        const quickAdds = page.locator(".cat-card-add:not([disabled])");
        if (await quickAdds.count()) {
          await click(page, quickAdds.first());
          await sleep(950);
        }
      }
    }
  }

  const cartBar = page.locator(".cat-cart-bar").first();
  if (await cartBar.count()) {
    await caption(page, "Korpa se pamti na uređaju kupca");
    await sleep(900);
    await click(page, cartBar);
    await sleep(1000);
    const drawer = page.locator(".cat-drawer").first();
    if (await drawer.count()) {
      await caption(page, "Korpa sa količinama, cenama i podacima za dostavu");
      await sleep(850);
      const drawerPlus = drawer.locator(`.cat-stepper button[aria-label="${SR["catalog.increase"]}"]`).first();
      if (await drawerPlus.count()) {
        await click(page, drawerPlus);
        await sleep(500);
      }
      const drawerMinus = drawer.locator(`.cat-stepper button[aria-label="${SR["catalog.decrease"]}"]`).first();
      if (await drawerMinus.count()) {
        await click(page, drawerMinus);
        await sleep(450);
      }
      const remove = drawer.locator(".cat-line-remove").first();
      if (await remove.count()) {
        await hover(page, remove);
        await sleep(550);
      }
      const form = drawer.locator(".cat-order-form").first();
      if (await form.count()) {
        const inputs = form.locator("input.cat-order-input");
        const values = ["Demo Kupac", "kupac@example.com", "+381 64 555 0100", "Beograd", "Ulica 12"];
        for (let i = 0; i < Math.min(await inputs.count(), values.length); i += 1) {
          await click(page, inputs.nth(i));
          await inputs.nth(i).fill(values[i]);
          await sleep(260);
        }
        await caption(page, "Podaci za dostavu — porudžbinu ne šaljemo u demou");
        await sleep(900);
        const submit = form.locator('button[type="submit"]').first();
        if (await submit.count()) {
          await hover(page, submit);
          await sleep(950);
        }
      }
      const drawerChannels = drawer.locator(".cat-channel");
      if (await drawerChannels.count()) {
        await hover(page, drawerChannels.first());
        await caption(page, "Ista porudžbina se šalje i kao poruka");
        await sleep(950);
      }
      const closeDrawer = drawer.locator(".cat-drawer-close").first();
      if (await closeDrawer.count()) await click(page, closeDrawer);
      await sleep(700);
    }
  }

  await scroll(page, 760, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.62 } });
  await caption(page, "Katalog je spreman za deljenje i samostalnu kupovinu");
  await sleep(900);
  const accountLink = page.locator(".cat-account-link").first();
  if (await accountLink.count()) {
    await hover(page, accountLink);
    await caption(page, "Kupac prati porudžbine i razgovore");
    await sleep(950);
    await click(page, accountLink);
    await page.waitForURL("**/account**", { timeout: 15000 }).catch(() => {});
    await sleep(1400);
  }
}

async function sceneCustomerAccount(page) {
  if (!page.url().includes("/account")) {
    await page.goto(`${BASE_URL}/catalog/${SHOP_ID}/account`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
  }
  await page.waitForSelector("main h1", { timeout: 20000 }).catch(() => {});
  await sleep(900);
  await caption(page, "Nalog kupca preko email linka — bez lozinke");
  const email = page.locator('main input[type="email"]').first();
  if (await email.count()) {
    await click(page, email);
    await email.pressSequentially("kupac@example.com", { delay: 42 });
    await sleep(700);
    const send = page.getByRole("button", { name: SR["chat.sendLink"], exact: true }).first();
    if (await send.count()) {
      await hover(page, send);
      await caption(page, "Link za prijavu stiže na email — ne šaljemo ga u demou");
      await sleep(1200);
    }
  }
  await scroll(page, 420);
  await caption(page, "Porudžbine, razgovori i praćenje statusa");
  await sleep(1000);
}

async function sceneImportExportAudit(page) {
  await fadeTo(page, `${BASE_URL}/dashboard/import`);
  await waitForApp(page);
  await sleep(1200);
  await caption(page, "Uvoz artikala iz CSV-a, XLS-a ili XLSX-a");
  await sleep(700);

  const templateButtons = page.locator(".glass button").filter({ hasText: /CSV|Excel/ });
  for (let i = 0; i < Math.min(await templateButtons.count(), 2); i += 1) {
    await hover(page, templateButtons.nth(i));
    await sleep(550);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logixia-demo-"));
  const csvPath = path.join(tempDir, `logixia-demo-${RUN_ID}.csv`);
  fs.writeFileSync(
    csvPath,
    [
      "\uFEFFname,sku,category,min_stock,cost_price,sale_price,supplier_name,variant_label,variant_sku,quantity",
      `Demo jakna ${RUN_ID},DEMO-${RUN_ID},Odeća,2,20,39.99,Demo dobavljač,Crna · M,DEMO-${RUN_ID}-M,5`,
      `Demo jakna ${RUN_ID},DEMO-${RUN_ID},Odeća,2,20,39.99,Demo dobavljač,Crna · L,DEMO-${RUN_ID}-L,3`,
    ].join("\n"),
    "utf8"
  );

  try {
    const fileInput = page.locator('.import-dropzone input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(csvPath);
      const preview = page.locator(".import-preview").first();
      await preview.waitFor({ state: "visible", timeout: 25000 }).catch(() => {});
      if (await preview.count()) {
        await bringIntoView(preview);
        await sleep(800);
        await caption(page, "Pregled redova i provera pre uvoza");
        await sleep(1000);
      }
      const aiButton = page.getByRole("button", { name: SR["import.aiButton"], exact: true }).first();
      if (await aiButton.count()) {
        await click(page, aiButton);
        await caption(page, "AI predlaže raspored kolona bez slanja podataka");
        const applied = page.getByText(SR["import.aiApplied"], { exact: true }).first();
        await applied.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
        await sleep(1100);
      }
      const importButton = page.getByRole("button", { name: new RegExp(`^${SR["import.importButton"].split("{")[0]}`) }).first();
      if (await importButton.count()) {
        await bringIntoView(importButton);
        await glide(page, importButton);
        await sleep(700);
        await caption(page, "Uvoz se pokreće tek na izričit klik");
        await sleep(1000);
      }
      await scroll(page, 360);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  await fadeTo(page, `${BASE_URL}/dashboard/export`);
  await waitForApp(page);
  await sleep(1100);
  const exportSummary = page.locator(".export-summary").first();
  if (await exportSummary.count()) {
    await bringIntoView(exportSummary);
    await glide(page, exportSummary);
    await caption(page, "Izvoz trenutnog stanja zaliha");
    await sleep(900);
  }
  await scroll(page, 380);
  const excel = page.getByText(SR["export.excel"], { exact: true }).first();
  if (await excel.count()) {
    await hover(page, excel);
    await sleep(650);
  }
  const print = page.getByText(SR["export.print"], { exact: true }).first();
  if (await print.count()) {
    await hover(page, print);
    await caption(page, "Excel izvoz ili štampa i PDF");
    await sleep(900);
  }

  await nav(page, "/dashboard/audit", "Istorija svake izmene");
  await waitForAny(page, ["main h1", ".audit-stats"], 12000);
  await sleep(1100);
  const filtersToggle = page.getByRole("button", { name: SR["audit.filters"], exact: true }).first();
  if (await filtersToggle.count()) {
    await click(page, filtersToggle);
    await sleep(800);
    const filterPanel = page.locator(".glass.fade-up").first();
    if (await filterPanel.count()) {
      const actor = filterPanel.locator("select").nth(0);
      if (await actor.count()) {
        await selectValue(page, actor, "all");
        await sleep(450);
      }
      const reason = filterPanel.locator("select").nth(1);
      if (await reason.count()) {
        await bringIntoView(reason);
        await selectValue(page, reason, "sale");
        await sleep(850);
        await caption(page, "Filter po tipu događaja");
        await sleep(700);
      }
      const product = filterPanel.locator("select").nth(2);
      if (await product.count()) {
        await selectValue(page, product, "all");
        await sleep(450);
      }
      const dateFrom = filterPanel.locator('input[type="date"]').nth(0);
      const dateTo = filterPanel.locator('input[type="date"]').nth(1);
      if (await dateFrom.count()) {
        await dateFrom.fill("2026-01-01");
        await sleep(350);
      }
      if (await dateTo.count()) {
        await dateTo.fill("2026-12-31");
        await sleep(500);
        await caption(page, "Filter po datumu i artiklu");
        await sleep(800);
      }
      const clear = page.getByRole("button", { name: SR["audit.clearFilters"], exact: true }).first();
      if (await clear.count()) {
        await click(page, clear);
        await sleep(700);
      }
    }
    await caption(page, "Filteri po zaposlenom, tipu i artiklu");
    await sleep(850);
  }
  const auditStats = page.locator(".audit-stats > div");
  for (let i = 0; i < Math.min(await auditStats.count(), 3); i += 1) {
    await glide(page, auditStats.nth(i), { steps: 12, delay: 6 });
    await sleep(230);
  }
  const auditPager = page.locator(".list-pagination").first();
  if (await auditPager.count()) {
    const moreEvents = auditPager.locator(".list-pagination-more").first();
    if (await moreEvents.count()) {
      await bringIntoView(moreEvents);
      await click(page, moreEvents);
      await sleep(750);
      await caption(page, "Učitavanje starijih događaja");
      await sleep(850);
    }
  }
  await scroll(page, 420);
  await caption(page, "Ko, šta i kada — svaka izmena je zabeležena");
  await sleep(1000);
}

async function sceneLegal(page) {
  for (const [slug, captionText] of [
    ["cookies", "Politika kolačića"],
    ["privacy", "Politika privatnosti"],
    ["terms", "Uslovi korišćenja"],
  ]) {
    await fadeTo(page, `${BASE_URL}/${slug}`);
    const heading = page.locator("main h1").first();
    await heading.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    await sleep(1000);
    await caption(page, captionText);
    await glide(page, heading);
    await sleep(650);
    await scroll(page, 620, { at: { x: VIEWPORT.width / 2, y: VIEWPORT.height * 0.62 } });
    await sleep(800);
  }
}

async function scenePreferences(page) {
  await fadeTo(page, `${BASE_URL}/dashboard`);
  await waitForApp(page);
  await sleep(1200);
  await scrollTop(page);
  await caption(page, "Svetla i tamna tema");
  await sleep(650);
  const toLight = page.locator('.app-sidebar button[aria-label="Switch to light mode"]').first();
  if (await toLight.count()) {
    await click(page, toLight);
    await sleep(1100);
    await scroll(page, 360);
    await caption(page, "Svetla tema je visokog kontrasta");
    await sleep(900);
    const toDark = page.locator('.app-sidebar button[aria-label="Switch to dark mode"]').first();
    if (await toDark.count()) await click(page, toDark);
    await sleep(800);
  }
  await scrollTop(page);

  const languageTrigger = page.locator('.app-sidebar button[aria-haspopup="listbox"]').first();
  if (await languageTrigger.count()) {
    await click(page, languageTrigger);
    await sleep(700);
    await caption(page, "Šest jezika u jednom kliku");
    await sleep(750);
    const english = page.getByRole("option", { name: "English", exact: true }).first();
    if (await english.count()) {
      await click(page, english);
      await sleep(2900);
      await caption(page, "Interfejs na engleskom jeziku");
      await sleep(1200);
      const trigger = page.locator('.app-sidebar button[aria-haspopup="listbox"]').first();
      if (await trigger.count()) {
        await click(page, trigger);
        await sleep(650);
        const serbian = page.getByRole("option", { name: "Srpski", exact: true }).first();
        if (await serbian.count()) {
          await click(page, serbian);
          await sleep(2900);
        }
      }
    }
    await caption(page, "Srpski, engleski, ruski, nemački, španski i italijanski");
    await sleep(1000);
  }
  await waitForApp(page).catch(() => {});
}

async function sceneOutro(page) {
  await caption(page, "Logixia");
  await sleep(600);
  await page.evaluate(() => window.__demoOutro?.()).catch(() => {});
  await sleep(3200);
}

async function checkAuth(chromium) {
  const context = await openContext(chromium, { record: false, headed: false });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-sidebar, .login-hero-title", { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    return page.url().includes("/dashboard");
  } finally {
    await context.close();
  }
}

async function runSetup(chromium) {
  console.log("[demo] Otvaram /login. Prijavi se Google nalogom u prozoru koji se otvori.");
  const context = await openContext(chromium, { record: false, headed: true });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    console.log("[demo] Cekam da stignes do /dashboard (do 5 minuta)...");
    await page.waitForURL("**/dashboard**", { timeout: 5 * 60 * 1000 });
    await page.waitForSelector(".app-sidebar", { timeout: 30000 });
    await sleep(3000);
    console.log("[demo] Prijava sacuvana u profilu. Sada pokreni `npm run demo`.");
  } finally {
    await context.close();
  }
}

async function recordSegment(chromium, { label, scenes, profileDir = PROFILE_DIR, seedCookieNotice = true, viewport = VIEWPORT }) {
  const context = await openContext(chromium, { record: true, headed: HEADED, profileDir, viewport });
  const page = context.pages()[0] ?? (await context.newPage());
  const video = page.video();
  let failed = false;

  await installOverlays(context, { seedCookieNotice });
  page.setDefaultTimeout(20000);
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));
  page.on("pageerror", (error) => console.warn(`[demo] pageerror: ${error.message}`));

  try {
    for (const [name, scene] of scenes) {
      await attempt(name, () => scene(page));
    }
  } catch (error) {
    console.error(`\n[demo] ${label}: snimanje prekinuto: ${error?.message ?? error}\n`);
    failed = true;
  } finally {
    await context.close().catch(() => {});
  }

  const source = video ? await video.path().catch(() => "") : "";
  if (!source || !fs.existsSync(source)) {
    console.error(`[demo] ${label}: video fajl nije sačuvan.`);
    return "";
  }
  if (failed) {
    fs.rmSync(source, { force: true });
    console.error(`[demo] ${label}: neuspešno snimanje je obrisano.`);
    return "";
  }
  return source;
}

function resolveFfmpeg() {
  try {
    const resolved = require("ffmpeg-static");
    if (typeof resolved === "string" && fs.existsSync(resolved)) return resolved;
  } catch {
    /* fall through to the local path */
  }
  const local = path.join(ROOT, "node_modules/ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return fs.existsSync(local) ? local : "";
}

const FFMPEG = resolveFfmpeg();

function runFfmpeg(args, { tolerateFailure = false } = {}) {
  try {
    return execFileSync(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
  } catch (error) {
    if (tolerateFailure) return "";
    throw error;
  }
}

function encodeMp4(source, target, { mobile = false } = {}) {
  const args = [
    "-y",
    "-i", source,
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
  ];
  // The mobile clip is portrait; scale it to the full video height and center
  // it on the dark canvas so it concatenates with the desktop segments.
  if (mobile) args.push("-vf", "scale=-2:1080,pad=1920:1080:(ow-iw)/2:0:color=0x0f0f14,setsar=1");
  args.push("-movflags", "+faststart", target);
  runFfmpeg(args);
}

function concatMp4(parts, target, { copy }) {
  const listPath = `${target}.txt`;
  const body = parts
    .map((part) => `file '${path.resolve(part).replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, `${body}\n`, "utf8");
  try {
    const args = ["-y", "-f", "concat", "-safe", "0", "-i", listPath];
    if (copy) args.push("-c", "copy");
    else
      args.push(
        "-an",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p"
      );
    args.push("-movflags", "+faststart", target);
    runFfmpeg(args);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(listPath, { force: true });
  }
}

function durationOf(file) {
  if (!FFMPEG) return 0;
  const text = (() => {
    try {
      return execFileSync(FFMPEG, ["-i", file], { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
    } catch (error) {
      return String(error?.stderr ?? "");
    }
  })();
  const match = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function keepWebmParts(sources, base) {
  const files = sources
    .filter(({ file }) => fs.existsSync(file))
    .map(({ file, label }, index) => {
      const target = sources.length === 1 ? `${base}.webm` : `${base}-${label ?? index + 1}.webm`;
      fs.renameSync(file, target);
      return target;
    });
  return { file: files[0] ?? "", extra: files.slice(1) };
}

function mergeRecordings(sources, stamp) {
  const base = path.join(OUT_DIR, `logixia-demo-${stamp}`);
  if (!FFMPEG) {
    return { ...keepWebmParts(sources, base), note: "ffmpeg nije dostupan — sačuvani WebM delovi" };
  }

  const encoded = [];
  try {
    if (sources.length === 1) {
      const [only] = sources;
      const target = `${base}.mp4`;
      encodeMp4(only.file, target, { mobile: only.mobile });
      fs.rmSync(only.file, { force: true });
      return { file: target };
    }

    sources.forEach(({ file, label, mobile }, index) => {
      const target = `${base}-${label ?? index + 1}.mp4`;
      encodeMp4(file, target, { mobile });
      encoded.push(target);
    });
    const target = `${base}.mp4`;
    const merged = concatMp4(encoded, target, { copy: true }) || concatMp4(encoded, target, { copy: false });
    if (!merged) throw new Error("spajanje nije uspelo");
    for (const { file } of sources) fs.rmSync(file, { force: true });
    for (const file of encoded) fs.rmSync(file, { force: true });
    return { file: target };
  } catch (error) {
    for (const file of encoded) fs.rmSync(file, { force: true });
    const note = `MP4 obrada nije uspela (${error?.message ?? error}) — sačuvani delovi`;
    return { ...keepWebmParts(sources, base), note };
  }
}

async function main() {
  const { chromium } = await loadPlaywright();

  if (SETUP) {
    await runSetup(chromium);
    return;
  }

  console.log(`[demo] Proveravam prijavu na ${BASE_URL} ...`);
  let authed = false;
  try {
    authed = await checkAuth(chromium);
  } catch (error) {
    console.error(
      `\n[demo] Ne mogu da otvorim ${BASE_URL}. Da li je dev server pokrenut?\n` +
        `(${error?.message ?? error})\n`
    );
    process.exit(1);
  }
  if (!authed) {
    console.error(
      "\n[demo] Nisi prijavljen u demo profil.\n" +
        "Pokreni prvo: npm run demo:setup\n" +
        "(prijavi se Google nalogom u prozoru koji se otvori)\n"
    );
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const merchantScenes = [
    ["Ulazna strana", sceneLanding],
    ["Pregled", sceneDashboard],
    ["Analitika", sceneAnalytics],
    ["Artikli", sceneProducts],
    ["Prijem robe", sceneReceive],
    ["Prodaja", sceneSales],
    ["Porudžbine", sceneOrders],
    ["Kupci", sceneCustomers],
    ["Katalog", sceneCatalog],
    ["Uvoz, izvoz i audit", sceneImportExportAudit],
    ["Pravne stranice", sceneLegal],
    ["Tema i jezik", scenePreferences],
  ];
  if (SKIP_CUSTOMER) merchantScenes.push(["Odjava", sceneOutro]);

  console.log("[demo] Snimam prodavčevu turu ...");
  const sources = [];
  const merchant = await recordSegment(chromium, { label: "Prodavac", scenes: merchantScenes });
  if (!merchant) {
    process.exit(1);
  }
  sources.push({ file: merchant, label: "prodavac" });

  if (!SKIP_CUSTOMER) {
    const mobileProfile = fs.mkdtempSync(path.join(os.tmpdir(), "logixia-demo-mobile-"));
    console.log("[demo] Snimam mobilnu scenu filtera ...");
    try {
      const mobile = await recordSegment(chromium, {
        label: "Mobilni",
        profileDir: mobileProfile,
        seedCookieNotice: true,
        viewport: MOBILE_VIEWPORT,
        scenes: [["Mobilni filteri", sceneMobileFilters]],
      });
      if (mobile) sources.push({ file: mobile, label: "mobilni", mobile: true });
      else console.warn("[demo] Mobilna scena nije snimljena; nastavljam bez nje.");
    } finally {
      try {
        fs.rmSync(mobileProfile, { recursive: true, force: true });
      } catch {
        /* Chrome may still hold a lock; the OS temp folder can be cleaned later */
      }
    }

    const customerProfile = fs.mkdtempSync(path.join(os.tmpdir(), "logixia-demo-customer-"));
    console.log("[demo] Snimam kupčevu turu (bez prijave) ...");
    try {
      const customer = await recordSegment(chromium, {
        label: "Kupac",
        profileDir: customerProfile,
        seedCookieNotice: false,
        scenes: [
          ["Katalog kupca", sceneCustomerCatalog],
          ["Nalog kupca", sceneCustomerAccount],
          ["Odjava", sceneOutro],
        ],
      });
      if (customer) sources.push({ file: customer, label: "kupac" });
      else console.warn("[demo] Kupčeva tura nije snimljena; koristim ostale delove.");
    } finally {
      try {
        fs.rmSync(customerProfile, { recursive: true, force: true });
      } catch {
        /* Chrome may still hold a lock; the OS temp folder can be cleaned later */
      }
    }
  }

  const result = mergeRecordings(sources, stamp);
  if (!result.file) {
    console.error("[demo] Nijedan video zapis nije sačuvan.");
    process.exit(1);
  }
  const mb = (fs.statSync(result.file).size / 1024 / 1024).toFixed(1);
  const seconds = Math.round(durationOf(result.file));
  const length = seconds ? `, ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";
  console.log(`\n[demo] Video sačuvan: ${path.relative(ROOT, result.file)} (${mb} MB${length})`);
  for (const extra of result.extra ?? []) {
    console.log(`[demo] dodatni deo: ${path.relative(ROOT, extra)}`);
  }
  if (result.note) console.log(`[demo] ${result.note}`);
  console.log("");
}

main().catch((error) => {
  console.error(`[demo] Greška: ${error?.stack ?? error}`);
  process.exit(1);
});
