import type { SVGProps } from "react";

export function QreminderLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* Bell body */}
      <path
        d="M12 2C8.686 2 6 4.686 6 8v3.5c0 1.5-.667 2.833-2 4 .333.333 2.333.5 8 .5s7.667-.167 8-.5c-1.333-1.167-2-2.5-2-4V8c0-3.314-2.686-6-6-6Z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Bell clapper */}
      <path
        d="M10 17.5c0 1.105.895 2 2 2s2-.895 2-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Reminder dot */}
      <circle cx="18" cy="5" r="3" fill="hsl(var(--primary))" />
    </svg>
  );
}
