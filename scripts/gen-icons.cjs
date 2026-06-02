/**
 * Regenerate the brand raster assets from the SVG sources.
 *
 * Run after editing the bell mark in packages/client/public/{favicon,icons/icon,
 * icons/icon-maskable}.svg to keep the PNGs and favicon.ico in sync:
 *
 *   node scripts/gen-icons.cjs
 *
 * Outputs: icons/icon-192.png, icons/icon-512.png, icons/apple-touch-icon-180.png,
 * icons/icon-maskable-512.png, favicon.ico (16/32/48). Uses the hoisted `sharp`.
 */
const fs = require("fs");
const path = require("path");

// sharp is a transitive (hoisted) dependency in this pnpm monorepo, so it is
// not at the workspace-root node_modules/sharp. Resolve it from the .pnpm store
// (version-agnostic) and fall back to standard resolution.
function resolveSharp() {
  const root = path.resolve(__dirname, "..");
  const candidates = [];
  const pnpmDir = path.join(root, "node_modules", ".pnpm");
  if (fs.existsSync(pnpmDir)) {
    for (const entry of fs.readdirSync(pnpmDir)) {
      if (/^sharp@/.test(entry)) {
        candidates.push(path.join(pnpmDir, entry, "node_modules", "sharp"));
      }
    }
  }
  candidates.push(path.join(root, "node_modules", "sharp"));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  return require("sharp"); // last resort: let Node resolve from NODE_PATH
}

const sharp = resolveSharp();

const pub = path.resolve(__dirname, "..", "packages/client/public");
const iconSvg = fs.readFileSync(path.join(pub, "icons/icon.svg"));
const maskSvg = fs.readFileSync(path.join(pub, "icons/icon-maskable.svg"));
const favSvg = fs.readFileSync(path.join(pub, "favicon.svg"));

function png(svgBuf, size, out) {
  return sharp(svgBuf, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
    .then(() => console.log("wrote", out));
}

function buildIco(sizes, pngs) {
  const count = sizes.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const bufs = [header, entries];
  for (let i = 0; i < count; i++) {
    const s = sizes[i];
    const data = pngs[i];
    const e = 16 * i;
    entries.writeUInt8(s >= 256 ? 0 : s, e + 0);
    entries.writeUInt8(s >= 256 ? 0 : s, e + 1);
    entries.writeUInt8(0, e + 2);
    entries.writeUInt8(0, e + 3);
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += data.length;
    bufs.push(data);
  }
  return Buffer.concat(bufs);
}

(async () => {
  await png(iconSvg, 192, path.join(pub, "icons/icon-192.png"));
  await png(iconSvg, 512, path.join(pub, "icons/icon-512.png"));
  await png(iconSvg, 180, path.join(pub, "icons/apple-touch-icon-180.png"));
  await png(maskSvg, 512, path.join(pub, "icons/icon-maskable-512.png"));

  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map((s) =>
      sharp(favSvg, { density: 384 })
        .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
    ),
  );
  fs.writeFileSync(path.join(pub, "favicon.ico"), buildIco(icoSizes, icoPngs));
  console.log("wrote", path.join(pub, "favicon.ico"));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
