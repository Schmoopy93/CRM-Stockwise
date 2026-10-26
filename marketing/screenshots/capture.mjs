import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PROFILE = path.join(ROOT, "demo/.profile");
const OUT = HERE;
const BASE_URL = "http://localhost:3000";
const SHOP_ID = "cMSZnwTNXABMGDAJrH1b";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

fs.mkdirSync(OUT, { recursive: true });

async function open(viewport, mobile) {
  const options = {
    headless: true,
    channel: "chrome",
    viewport,
    deviceScaleFactor: mobile ? 3 : 2,
    isMobile: mobile,
    hasTouch: mobile,
    locale: "sr-RS",
    timezoneId: "Europe/Belgrade",
    colorScheme: "dark",
    acceptDownloads: false,
    args: ["--disable-blink-features=AutomationControlled", "--hide-scrollbars"],
    ignoreDefaultArgs: ["--enable-automation"],
  };
  try {
    return await chromium.launchPersistentContext(PROFILE, options);
  } catch {
    await sleep(1500);
    return chromium.launchPersistentContext(PROFILE, options);
  }
}

async function prepare(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("inventory-locale", "sr");
      localStorage.setItem("inventory-theme", "dark");
      localStorage.setItem("inventory-cookie-notice", "1");
    } catch {}
  });
}

async function hideDevChrome(page) {
  await page
    .addStyleTag({
      content: "nextjs-portal{display:none!important} [data-nextjs-toast]{display:none!important}",
    })
    .catch(() => {});
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(1800);
  await page
    .evaluate(() => {
      document.querySelector(".app-main")?.scrollTo({ top: 0, left: 0 });
      window.scrollTo({ top: 0, left: 0 });
    })
    .catch(() => {});
  await page.waitForTimeout(350);
  await hideDevChrome(page);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, animations: "disabled" });
  console.log(`${name}.png`);
}

async function goto(page, url, selector) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(selector, { timeout: 30000 });
  await settle(page);
}

async function desktop() {
  const context = await open({ width: 1920, height: 1080 }, false);
  await prepare(context);
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30000);
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

  try {
    await goto(page, "/dashboard", ".app-main h1");
    if (page.url().includes("/login")) throw new Error("Demo profil nije prijavljen. Pokreni npm run demo:setup.");
    await shot(page, "desktop-01-overview");

    await goto(page, "/dashboard/products", ".app-main h1");
    await page.waitForSelector('a[href^="/dashboard/products/"]', { timeout: 15000 }).catch(() => {});
    await settle(page);
    await shot(page, "desktop-02-products");

    await goto(page, "/dashboard/analytics", ".app-main h1");
    await page.waitForTimeout(1600);
    await shot(page, "desktop-03-analytics");

    await goto(page, "/dashboard/sales", ".app-main h1");
    await shot(page, "desktop-04-sales");

    await goto(page, `/catalog/${SHOP_ID}`, ".cat-card");
    await page.waitForTimeout(600);
    await shot(page, "desktop-05-catalog");
  } finally {
    await context.close().catch(() => {});
  }
}

async function mobile() {
  const context = await open({ width: 430, height: 932 }, true);
  await prepare(context);
  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30000);
  page.on("dialog", (dialog) => dialog.dismiss().catch(() => {}));

  try {
    await goto(page, "/dashboard", ".app-main h1");
    await shot(page, "mobile-01-overview");

    await goto(page, `/catalog/${SHOP_ID}`, ".cat-card");
    await shot(page, "mobile-02-catalog");

    const trigger = page.locator(".cat-filter-trigger").first();
    if (await trigger.isVisible().catch(() => false)) {
      await trigger.click();
      await page.waitForSelector(".cat-filter-sheet", { timeout: 10000 });
      await page.waitForTimeout(700);
      await shot(page, "mobile-03-filters");
      await page.locator(".cat-filter-apply").first().click().catch(() => {});
      await page.waitForTimeout(500);
    }

    await page.locator(".cat-card-hit, .cat-card").first().click();
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await page.waitForTimeout(900);
    await shot(page, "mobile-04-product");
  } finally {
    await context.close().catch(() => {});
  }
}

const target = process.argv[2];
if (target !== "mobile") await desktop();
if (target !== "desktop") await mobile();
console.log(`Screenshots: ${OUT}`);
