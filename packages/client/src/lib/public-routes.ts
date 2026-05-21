/**
 * 公共路由白名单（无需登录即可访问）。
 *
 * 为什么抽出来：
 * - 路由保护集中在 `src/components/auth-sync.tsx`，这里提供统一白名单。
 * - 白名单集中维护可以避免登录页里的条款/隐私链接无法访问。
 *
 * 约定：
 * - 这里仅判断“路径名”，不处理 query/hash
 * - API 路由不在此处处理，PocketBase/Go API 会自行返回 401/403。
 */

/** 判断某个 pathname 是否为“公开页面”。 */
export function isPublicRoutePath(pathname: string): boolean {
  // Auth pages
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/change-credentials"
  ) {
    return true;
  }

  // Legal pages (linked from /login)
  if (pathname === "/terms" || pathname === "/privacy") {
    return true;
  }

  // Static docs (public/docs/* -> /docs/*)
  if (pathname === "/docs" || pathname.startsWith("/docs/")) {
    return true;
  }

  return false;
}
