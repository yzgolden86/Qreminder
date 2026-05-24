// Generate PNG PWA icons from icon.svg.
// Why: Chrome on Android requires at least one raster icon >=144px in the manifest
// to satisfy PWA install criteria. SVG-only manifests show "install" UI but the
// install action silently no-ops on some Chrome versions.
//
// Setup (one-time): pnpm add -D sharp
// Run:              node packages/client/scripts/generate-pwa-icons.mjs
//
// Outputs (committed): icon-192.png, icon-512.png, apple-touch-icon-180.png, icon-maskable-512.png

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(__dirname, "../public");

async function emit(svg, size, name, maskable = false) {
  const out = resolve(PUBLIC, "icons", name);
  const buf = Buffer.from(svg);
  const pipeline = sharp(buf, { density: 384 }).resize(size, size, { fit: "cover" });
  if (maskable) {
    // Add a small safe-area inset for maskable icons (Android adaptive icon mask
    // crops up to 10% from each edge — pre-shrink so the logo stays visible).
    const inset = Math.round(size * 0.1);
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 11, g: 17, b: 25, alpha: 1 },
      },
    })
      .composite([
        {
          input: await sharp(buf, { density: 384 })
            .resize(size - inset * 2, size - inset * 2, { fit: "cover" })
            .png()
            .toBuffer(),
          top: inset,
          left: inset,
        },
      ])
      .png({ compressionLevel: 9 })
      .toFile(out);
  } else {
    await pipeline.png({ compressionLevel: 9 }).toFile(out);
  }
  console.log(`wrote ${out}`);
}

const svg = await readFile(resolve(PUBLIC, "icons/icon.svg"), "utf8");

await emit(svg, 192, "icon-192.png");
await emit(svg, 512, "icon-512.png");
await emit(svg, 180, "apple-touch-icon-180.png");
await emit(svg, 512, "icon-maskable-512.png", true);
