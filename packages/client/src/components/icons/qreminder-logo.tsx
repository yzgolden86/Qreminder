import type { SVGProps } from "react";

/** 渲染 Ledger Sans 风格的 Qreminder 品牌符号。 */
export function QreminderLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect x="2" y="5" width="14" height="4" rx="2" fill="currentColor" />
      <circle cx="20" cy="7" r="2" fill="hsl(var(--primary))" />
      <rect x="4" y="14" width="14.5" height="3" rx="1.5" fill="hsl(var(--primary))" />
    </svg>
  );
}
