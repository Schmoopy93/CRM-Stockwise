import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const srcFile = readdirSync("vibe_images").find((f) => f.startsWith("stockwise-icon"));
if (!srcFile) throw new Error("stockwise-icon source not found in vibe_images/");
const SRC = join("vibe_images", srcFile);

await sharp(SRC).resize(512, 512).png().toFile("public/android-chrome-512x512.png");
await sharp(SRC).resize(192, 192).png().toFile("public/android-chrome-192x192.png");
await sharp(SRC).resize(180, 180).png().toFile("public/apple-touch-icon.png");

// favicon.ico as an ICO container embedding PNG frames (16/32/48).
// ensureAlpha() is required: Next's ICO decoder rejects RGB PNG frames.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map((s) => sharp(SRC).resize(s, s).ensureAlpha().png().toBuffer()));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
sizes.forEach((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(frames[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += frames[i].length;
  entries.push(entry);
});
writeFileSync("app/favicon.ico", Buffer.concat([header, ...entries, ...frames]));

const iconSize = 256;
const corner = Math.round(iconSize * 0.22);
const mask = Buffer.from(`<svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${iconSize}" height="${iconSize}" rx="${corner}" ry="${corner}"/></svg>`);
const icon = await sharp(SRC)
  .resize(iconSize, iconSize)
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();
const iconTop = Math.round((630 - iconSize) / 2);
const svg = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0f0f14"/>
  <defs>
    <radialGradient id="glow" cx="25%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="440" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="104" font-weight="800" fill="#f0f0f5" letter-spacing="-2">Stockwise</text>
  <text x="446" y="368" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="500" fill="#a5b4fc">Inventory and sales — in real time</text>
</svg>`);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#0f0f14" } })
  .composite([
    { input: svg, top: 0, left: 0 },
    { input: icon, top: iconTop, left: 120 },
  ])
  .png()
  .toFile("public/og.png");

console.log("brand assets written: app/favicon.ico, public/apple-touch-icon.png, public/android-chrome-*.png, public/og.png");

// The print/PDF export embeds the logo as a data URI (relative URLs break in
// window.print), so rewrite that constant in lib/export.ts from the same source.
const exportTs = readFileSync("lib/export.ts", "utf8");
const logoUri = `data:image/png;base64,${(await sharp(SRC).resize(128, 128).png().toBuffer()).toString("base64")}`;
if (!/const EXPORT_LOGO_DATA_URI = "data:image\/png;base64,[^"]*";/.test(exportTs)) {
  throw new Error("EXPORT_LOGO_DATA_URI not found in lib/export.ts");
}
writeFileSync("lib/export.ts", exportTs.replace(/const EXPORT_LOGO_DATA_URI = "data:image\/png;base64,[^"]*";/, `const EXPORT_LOGO_DATA_URI = "${logoUri}";`));
console.log("lib/export.ts: EXPORT_LOGO_DATA_URI refreshed");
