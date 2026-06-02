const FALLBACK_PRIMARY = "160 84% 39%";
const FALLBACK_GLOW = "160 84% 45%";

function readCssHsl(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function ensureFaviconLink(): HTMLLinkElement {
  const existing =
    document.querySelector<HTMLLinkElement>("#qreminder-favicon") ??
    document.querySelector<HTMLLinkElement>('link[rel="icon"]');

  if (existing) {
    existing.id = "qreminder-favicon";
    existing.rel = "icon";
    existing.type = "image/svg+xml";
    return existing;
  }

  const link = document.createElement("link");
  link.id = "qreminder-favicon";
  link.rel = "icon";
  link.type = "image/svg+xml";
  document.head.appendChild(link);
  return link;
}

export function buildBrandFaviconSvg(primary: string, glow: string, isDark: boolean): string {
  const shell = isDark ? "#0B1119" : "#111720";
  const inner = "#171C24";
  const rim = isDark ? "#26313D" : "#2C3642";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
    "<defs>",
    '<radialGradient id="glow" cx="50" cy="16" r="42" gradientUnits="userSpaceOnUse">',
    '<stop offset="0" stop-color="hsl(' + glow + ')" stop-opacity="0.24"/>',
    '<stop offset="0.52" stop-color="hsl(' + primary + ')" stop-opacity="0.08"/>',
    '<stop offset="1" stop-color="hsl(' + primary + ')" stop-opacity="0"/>',
    "</radialGradient>",
    "</defs>",
    '<rect x="4" y="4" width="56" height="56" rx="18" fill="' + shell + '"/>',
    '<rect x="5.5" y="5.5" width="53" height="53" rx="16.5" fill="' + inner + '" stroke="' + rim + '" stroke-width="1.5"/>',
    '<rect x="5.5" y="5.5" width="53" height="53" rx="16.5" fill="url(#glow)"/>',
    '<g transform="translate(13.88 16.41) scale(1.45)">',
    '<path d="M12 2C8.686 2 6 4.686 6 8v3.5c0 1.5-.667 2.833-2 4 .333.333 2.333.5 8 .5s7.667-.167 8-.5c-1.333-1.167-2-2.5-2-4V8c0-3.314-2.686-6-6-6Z" fill="#F8FAFC" opacity="0.9"/>',
    '<path d="M10 17.5c0 1.105.895 2 2 2s2-.895 2-2" stroke="#F8FAFC" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
    '<circle cx="18" cy="5" r="3" fill="hsl(' + primary + ')"/>',
    "</g>",
    "</svg>",
  ].join("");
}

export function updateBrandFavicon(): void {
  if (typeof document === "undefined") return;

  const primary = readCssHsl("--primary", FALLBACK_PRIMARY);
  const glow = readCssHsl("--primary-glow", FALLBACK_GLOW);
  const svg = buildBrandFaviconSvg(primary, glow, document.documentElement.classList.contains("dark"));
  const link = ensureFaviconLink();
  link.href = "data:image/svg+xml," + encodeURIComponent(svg);
}
