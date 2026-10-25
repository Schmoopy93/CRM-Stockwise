import path from "node:path";
import { chromium } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const profileDir = path.join(ROOT, "demo", ".profile");

const context = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: true,
  viewport: { width: 1600, height: 900 },
});
await context.addInitScript(() => {
  localStorage.setItem("inventory-locale", "sr");
});
const page = context.pages()[0] ?? (await context.newPage());

async function read(url, waitFor) {
  await page.goto(`http://localhost:3000${url}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(waitFor, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

await read("/dashboard", ".dashboard-stat");
const dashboard = await page.locator(".dashboard-stat").evaluateAll((tiles) =>
  tiles.map((tile) => (tile.textContent ?? "").trim().replace(/\s+/g, " "))
);

await read("/dashboard/analytics", ".analytics-stats-main");
const analytics = await page.locator(".analytics-stats-main .analytics-stat").evaluateAll((tiles) =>
  tiles.map((tile) => (tile.textContent ?? "").trim().replace(/\s+/g, " "))
);

await read("/dashboard/products", ".products-row, .products-card, .products-list");
const products = await page.locator('a[href^="/dashboard/products/"]').count();

await read("/dashboard/customers", 'a[href^="/dashboard/customers/"], .glass');
const customers = await page.locator('a[href^="/dashboard/customers/"]').count();

await read("/dashboard/orders", "main");
const orders = await page.evaluate(() => {
  const section = document.querySelector('section[aria-label="Porudžbine"]');
  const tiles = section ? [...section.children].map((c) => (c.textContent ?? "").trim().replace(/\s+/g, " ")) : [];
  const conversations = document.querySelectorAll('section[aria-label="Razgovori sa kupcima"] article').length;
  return { tiles, conversations };
});

await read("/dashboard/sales", "main");
const sales = await page.evaluate(() => {
  const main = document.querySelector("main");
  return (main?.innerText ?? "").split("\n").filter((l) => /prodaj|RSD/i.test(l)).slice(0, 20);
});

console.log(JSON.stringify({ dashboard, analytics, products, customers, orders, sales }, null, 2));
await context.close();
