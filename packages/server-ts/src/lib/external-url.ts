export class ExternalUrlError extends Error {
  constructor(
    public readonly reason: string,
    message = reason,
  ) {
    super(message);
  }
}

export function assertExternalHttpUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ExternalUrlError("invalid_url", "Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ExternalUrlError("invalid_protocol", "Only http/https URLs are allowed");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new ExternalUrlError("private_host_blocked", "Private/internal hosts are not allowed");
  }

  return parsed;
}

export function resolveExternalRedirectUrl(location: string, baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(location, baseUrl);
  } catch {
    throw new ExternalUrlError("invalid_redirect", "Invalid redirect URL");
  }
  return assertExternalHttpUrl(parsed.toString());
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata.google.internal") return true;

  const ipv4 = parseIpv4(host);
  if (ipv4) return isPrivateIpv4(ipv4);

  if (isLikelyIpv6(host)) return isPrivateIpv6(host);

  return false;
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const octets = parts.map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets as [number, number, number, number];
}

function isPrivateIpv4([a, b]: [number, number, number, number]): boolean {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isLikelyIpv6(host: string): boolean {
  return host.includes(":");
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("ff")) return true;
  const mappedIpv4 = parseIpv4MappedIpv6(normalized);
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) return true;
  if (normalized.includes(":127.")) return true;
  if (normalized.includes(":10.")) return true;
  if (normalized.includes(":192.168.")) return true;
  return false;
}

function parseIpv4MappedIpv6(host: string): [number, number, number, number] | null {
  const groups = expandIpv6Groups(host);
  if (!groups) return null;

  const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isCompatible = groups.slice(0, 6).every((group) => group === 0);
  if (!isMapped && !isCompatible) return null;

  return [
    (groups[6]! >> 8) & 0xff,
    groups[6]! & 0xff,
    (groups[7]! >> 8) & 0xff,
    groups[7]! & 0xff,
  ];
}

function expandIpv6Groups(host: string): number[] | null {
  const compressed = host.split("::");
  if (compressed.length > 2) return null;

  const left = compressed[0] ? compressed[0].split(":") : [];
  const right = compressed[1] ? compressed[1].split(":") : [];
  const missing = compressed.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 0) return null;

  const parts = compressed.length === 2
    ? [...left, ...Array<string>(missing).fill("0"), ...right]
    : left;
  if (parts.length !== 8) return null;

  const groups: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(Number.parseInt(part, 16));
  }
  return groups;
}
