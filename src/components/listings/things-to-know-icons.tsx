import React from "react";

/**
 * The three "Things to know" (POLICIES_DEFAULT) glyphs, lifted verbatim from
 * Airbnb's room PDP — the calendar-with-X (cancellation), the person-with-clock
 * (house rules) and the shield (safety). Paths are the original 32×32 Airbnb
 * artwork (`.clone/airbnb-ttk/assets/icon-{0,1,2}.svg`), rendered at 24px with
 * `fill: currentColor` so the icon inherits the row's text color. The trailing
 * chevron (`ChevronForwardIcon`) is the 16px stroked affordance Airbnb shows on
 * the mobile clickable rows.
 */

type IconProps = {
  /** px size for both width and height. Airbnb uses 24 for the leading glyph. */
  size?: number;
  className?: string;
};

function baseSvgProps(size: number, className?: string) {
  return {
    viewBox: "0 0 32 32",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
    role: "presentation" as const,
    focusable: false,
    className,
    style: {
      display: "block",
      height: size,
      width: size,
      fill: "currentcolor",
    },
  };
}

export function CancellationPolicyIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <path d="m12 0v2h8v-2h2v2h6c1.1045695 0 2 .8954305 2 2v21c0 2.7614237-2.2385763 5-5 5h-18c-2.76142375 0-5-2.2385763-5-5v-21c0-1.1045695.8954305-2 2-2h6v-2zm16 12h-24v13c0 1.6568542 1.34314575 3 3 3h18c1.6568542 0 3-1.3431458 3-3zm-8.2071068 2.2928932 1.4142136 1.4142136-3.7921068 3.7928932 3.7921068 3.7928932-1.4142136 1.4142136-3.7928932-3.7921068-3.7928932 3.7921068-1.4142136-1.4142136 3.7921068-3.7928932-3.7921068-3.7928932 1.4142136-1.4142136 3.7928932 3.7921068zm-9.7928932-10.2928932h-6v6h24v-6h-6v2h-2v-2h-8v2h-2z" />
    </svg>
  );
}

export function HouseRulesIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <path d="M16.84 27.16v-3.4l-.26.09c-.98.32-2.03.51-3.11.55h-.7A11.34 11.34 0 0 1 1.72 13.36v-.59A11.34 11.34 0 0 1 12.77 1.72h.59c6.03.16 10.89 5.02 11.04 11.05V13.45a11.3 11.3 0 0 1-.9 4.04l-.13.3 7.91 7.9v5.6H25.7l-4.13-4.13zM10.31 7.22a3.1 3.1 0 1 1 0 6.19 3.1 3.1 0 0 1 0-6.2zm0 2.06a1.03 1.03 0 1 0 0 2.06 1.03 1.03 0 0 0 0-2.06zM22.43 25.1l4.12 4.13h2.67v-2.67l-8.37-8.37.37-.68.16-.3c.56-1.15.9-2.42.96-3.77v-.64a9.28 9.28 0 0 0-9-9h-.55a9.28 9.28 0 0 0-9 9v.54a9.28 9.28 0 0 0 13.3 8.1l.3-.16 1.52-.8v4.62z" />
    </svg>
  );
}

export function SafetyPropertyIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...baseSvgProps(size, className)}>
      <path d="m16 .8.56.37C20.4 3.73 24.2 5 28 5h1v12.5C29 25.57 23.21 31 16 31S3 25.57 3 17.5V5h1c3.8 0 7.6-1.27 11.45-3.83L16 .8zm-1 3a22.2 22.2 0 0 1-9.65 3.15L5 6.97V17.5c0 6.56 4.35 11 10 11.46zm2 0v25.16c5.65-.47 10-4.9 10-11.46V6.97l-.35-.02A22.2 22.2 0 0 1 17 3.8z" />
    </svg>
  );
}

/** 16px stroked chevron Airbnb trails on the mobile clickable rows. */
export function ChevronForwardIcon({ size = 16, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      className={className}
      style={{
        display: "block",
        fill: "none",
        height: size,
        width: size,
        stroke: "currentcolor",
        strokeWidth: 4,
        overflow: "visible",
      }}
    >
      <path fill="none" d="m12 4 11.3 11.3a1 1 0 0 1 0 1.4L12 28" />
    </svg>
  );
}
