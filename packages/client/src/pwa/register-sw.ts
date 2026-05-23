/**
 * Service Worker 注册入口。
 *
 * 仅在生产构建中注册 sw.js，避免开发期 Vite HMR 与缓存冲突。
 * 用 ?: 守卫，浏览器不支持 ServiceWorker 时静默跳过。
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err: unknown) => {
        if (typeof console !== "undefined") {
          console.warn("[pwa] service worker registration failed:", err);
        }
      });
  });
}
