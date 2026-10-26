import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const A4_HEIGHT_PX = 1122.52;

const jobs = [
  { html: "marketing/brochures/src/brochure-sr.html", pdf: "marketing/brochures/logixia-brosura-sr.pdf" },
  { html: "marketing/brochures/src/brochure-en.html", pdf: "marketing/brochures/logixia-brochure-en.pdf" },
];

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
let overflow = false;

for (const job of jobs) {
  const htmlPath = path.join(root, job.html);
  const pdfPath = path.join(root, job.pdf);
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        })
      )
    );
  });

  const metrics = await page.evaluate(() => {
    const pageEl = document.querySelector(".page");
    const clone = pageEl.cloneNode(true);
    clone.style.position = "absolute";
    clone.style.height = "auto";
    clone.style.visibility = "hidden";
    document.body.appendChild(clone);
    const natural = clone.getBoundingClientRect().height;
    clone.remove();
    return {
      natural,
      width: pageEl.getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      images: Array.from(document.images).map((img) => ({ src: img.getAttribute("src"), ok: img.naturalWidth > 0 })),
    };
  });

  if (metrics.natural > A4_HEIGHT_PX + 0.5 || metrics.scrollWidth > 794) {
    overflow = true;
    console.error(`OVERFLOW ${job.html}: content ${metrics.natural.toFixed(1)}px / ${A4_HEIGHT_PX}px, scrollWidth ${metrics.scrollWidth}px`);
  }
  const badImages = metrics.images.filter((img) => !img.ok);
  if (badImages.length) {
    console.error(`MISSING IMAGE ${job.html}: ${badImages.map((img) => img.src).join(", ")}`);
  }

  const layoutIssues = await page.evaluate(() => {
    const issues = [];
    const box = (el) => el.getBoundingClientRect();
    document.querySelectorAll(".feature, .step").forEach((card, index) => {
      const outer = box(card);
      card.querySelectorAll("*").forEach((node) => {
        if (node.children.length) return;
        const inner = box(node);
        if (inner.bottom > outer.bottom - 2 || inner.right > outer.right - 2 || inner.left < outer.left + 2) {
          issues.push(`card ${index + 1}: ${node.className || node.tagName} leaves its box`);
        }
      });
    });
    const head = document.querySelector(".section-head");
    if (head) {
      const [title, sub] = head.children;
      if (box(title).right > box(sub).left - 8) issues.push(`section head collides at "${title.textContent}"`);
    }
    const cta = document.querySelector(".cta");
    if (cta) {
      const copy = box(cta.querySelector(".cta-copy"));
      const link = box(cta.querySelector(".cta-link"));
      if (copy.right > link.left - 4) issues.push("CTA copy overlaps the link");
    }
    return issues;
  });
  if (layoutIssues.length) {
    overflow = true;
    layoutIssues.forEach((issue) => console.error(`LAYOUT ${job.html}: ${issue}`));
  }

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  console.log(`${job.pdf}: content ${metrics.natural.toFixed(1)}px, width ${metrics.width.toFixed(1)}px`);
  await page.close();
}

await browser.close();
if (overflow) process.exitCode = 1;
