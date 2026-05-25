/* Qreminder Service Worker
 * 策略：
 * - HTML 导航请求：network-first，失败回退到 /offline.html
 * - 同源静态资源（JS/CSS/字体/图片）：stale-while-revalidate
 * - GET /api/* 读取：network-first，失败时返回最近缓存（带 sw-from-cache 标记）
 * - 鉴权 (/_/* 及 /api/auth/*) 与非 GET 请求：直接走网络，不缓存
 * - 跨源请求：直接走网络
 */
const CACHE_VERSION = "qreminder-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isAuthEndpoint(url) {
  return (
    url.pathname.startsWith("/_/") ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/admin/")
  );
}

function isApiPath(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(
    url.pathname,
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Non-GET (mutations): never cache; let auth + write paths reach origin.
  if (request.method !== "GET") return;

  // Auth + admin endpoints: pass-through to avoid stale session/permission data.
  if (isAuthEndpoint(url)) return;

  if (isApiPath(url)) {
    event.respondWith(apiNetworkFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match("/offline.html");
    return (
      cached ?? new Response("offline", { status: 503, statusText: "Offline" })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type === "basic") {
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    })
    .catch(() => null);
  return cached ?? (await networkPromise) ?? Response.error();
}

// Network-first for API GETs: prefer fresh data, fall back to cached snapshot
// when offline. The "sw-from-cache" header lets the client surface a stale
// banner without changing JSON shapes.
async function apiNetworkFirst(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("sw-from-cache", "1");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: "offline" }), {
      status: 503,
      statusText: "Offline",
      headers: { "content-type": "application/json", "sw-offline": "1" },
    });
  }
}

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
