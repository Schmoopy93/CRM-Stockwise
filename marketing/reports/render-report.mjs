import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const htmlPath = path.join(here, "src/logixia-izvestaj-troskovi-monetizacija.html");
const pdfPath = path.join(here, "logixia-izvestaj-troskovi-monetizacija.pdf");
const EXPECTED_PAGES = 10;

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(Array.from(document.images).map((img) =>
    img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.onload = resolve;
      img.onerror = resolve;
    })
  ));
});

const audit = await page.evaluate(() => {
  const sheets = [...document.querySelectorAll(".sheet")];
  return {
    count: sheets.length,
    scrollWidth: document.documentElement.scrollWidth,
    missingImages: [...document.images].filter((img) => img.naturalWidth === 0).map((img) => img.getAttribute("src")),
    pages: sheets.map((sheet, index) => {
      const box = sheet.getBoundingClientRect();
      const structural = [...sheet.querySelectorAll(".s-head, .s-body, .s-foot, .cover-top, .cover-bottom, .contact, .kpi, .finding, .rec, .callout, .table, .lever, .plan, .panel, .gate, .addon, .bar-row")];
      const escaping = structural
        .filter((el) => el.getBoundingClientRect().width > 0)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.bottom > box.bottom - 2 || r.right > box.right - 2 || r.left < box.left + 2 || r.top < box.top + 2;
        })
        .map((el) => `${el.className || el.tagName} bottom=${el.getBoundingClientRect().bottom.toFixed(1)}`);
      const foot = sheet.querySelector(".s-foot");
      const footBox = foot ? foot.getBoundingClientRect() : null;
      const body = sheet.querySelector(".s-body");
      const bodyBox = body ? body.getBoundingClientRect() : null;
      const lastBodyChild = body ? body.lastElementChild : null;
      const lastChildBox = lastBodyChild ? lastBodyChild.getBoundingClientRect() : null;
      return {
        page: index + 1,
        clientHeight: sheet.clientHeight,
        scrollHeight: sheet.scrollHeight,
        bodyClientHeight: body ? body.clientHeight : null,
        bodyScrollHeight: body ? body.scrollHeight : null,
        bodyBottom: bodyBox ? Number(bodyBox.bottom.toFixed(1)) : null,
        lastChildBottom: lastChildBox ? Number(lastChildBox.bottom.toFixed(1)) : null,
        footerTop: footBox ? Number(footBox.top.toFixed(1)) : null,
        footerBottom: footBox ? Number(footBox.bottom.toFixed(1)) : null,
        pageBottom: Number(box.bottom.toFixed(1)),
        escaping: escaping.slice(0, 8),
      };
    }),
  };
});

let failed = false;
if (audit.count !== EXPECTED_PAGES) {
  console.error(`PAGE COUNT IN DOM: ${audit.count}, expected ${EXPECTED_PAGES}`);
  failed = true;
}
if (audit.scrollWidth > 794) {
  console.error(`HORIZONTAL OVERFLOW: document scrollWidth ${audit.scrollWidth}`);
  failed = true;
}
if (audit.missingImages.length) {
  console.error(`MISSING IMAGES: ${audit.missingImages.join(", ")}`);
  failed = true;
}
for (const p of audit.pages) {
  if (p.scrollHeight > p.clientHeight + 1) {
    console.error(`PAGE ${p.page} OVERFLOW: scrollHeight ${p.scrollHeight} > clientHeight ${p.clientHeight}`);
    failed = true;
  }
  if (p.escaping.length) {
    console.error(`PAGE ${p.page} ELEMENTS OUTSIDE: ${p.escaping.join(" | ")}`);
    failed = true;
  }
  if (p.footerTop !== null && p.footerBottom !== null && p.footerBottom > p.pageBottom - 2) {
    console.error(`PAGE ${p.page} FOOTER TOO LOW: footerBottom ${p.footerBottom}, pageBottom ${p.pageBottom}`);
    failed = true;
  }
  if (p.bodyScrollHeight !== null && p.bodyClientHeight !== null && p.bodyScrollHeight > p.bodyClientHeight + 1) {
    console.error(`PAGE ${p.page} BODY OVERFLOW: ${p.bodyScrollHeight} > ${p.bodyClientHeight}`);
    failed = true;
  }
  if (p.lastChildBottom !== null && p.footerTop !== null && p.lastChildBottom > p.footerTop - 3) {
    console.error(`PAGE ${p.page} CONTENT HITS FOOTER: last child ${p.lastChildBottom}, footer ${p.footerTop}`);
    failed = true;
  }
  console.log(`page ${String(p.page).padStart(2, "0")}: scroll ${p.scrollHeight}/${p.clientHeight}, body ${p.bodyScrollHeight}/${p.bodyClientHeight}, last ${p.lastChildBottom} → footer ${p.footerTop}`);
}

await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await page.close();
await browser.close();

const bytes = await fs.readFile(pdfPath);
const raw = bytes.toString("latin1");
const pageMatches = raw.match(/\/Type\s*\/Page[^s]/g) ?? [];
const mediaBoxes = [...raw.matchAll(/\/MediaBox\s*\[([^\]]+)\]/g)].map((m) => m[1].trim());
const uniqueBoxes = [...new Set(mediaBoxes)];
const size = (await fs.stat(pdfPath)).size;
const a4 = uniqueBoxes.every((b) => {
  const [x1, y1, x2, y2] = b.split(/\s+/).map(Number);
  return Math.abs(x1) < 1 && Math.abs(y1) < 1 && Math.abs(x2 - 595.28) < 1.5 && Math.abs(y2 - 841.89) < 1.5;
});
console.log("");
console.log(`PDF: ${pdfPath}`);
console.log(`size: ${(size / 1024).toFixed(0)} KB`);
console.log(`pages (PDF objects): ${pageMatches.length}, expected ${EXPECTED_PAGES}`);
console.log(`MediaBox: ${uniqueBoxes.join(" | ") || "not found"} (${a4 ? "A4" : "NOT A4"})`);
if (pageMatches.length !== EXPECTED_PAGES) {
  console.error("PDF PAGE COUNT MISMATCH");
  failed = true;
}
if (!a4) {
  console.error("PDF IS NOT A4");
  failed = true;
}
if (failed) process.exitCode = 1;
