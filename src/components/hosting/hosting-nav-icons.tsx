// Official Airbnb host bottom-nav glyphs, captured 1:1 from the live
// /hosting/* mobile tab bar (viewBox 0 0 32 32). Today + Calendar are filled;
// Listings, Messages, Menu are stroked. Simple monochrome UI icons.
type IconProps = { className?: string };

const box = { display: "block", height: 24, width: 24 } as const;
const stroke = { ...box, fill: "none", stroke: "currentColor", overflow: "visible" } as const;

export function TodayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ ...box, fill: "currentColor" }} aria-hidden="true" role="presentation" focusable="false">
      <path d="M24.67 1.67H7.33a3 3 0 0 0-3 3v26.47L16 23.84l11.67 7.3V4.67a3 3 0 0 0-3-3zm0 2h.11a1 1 0 0 1 .89 1v22.86L16 21.49l-9.67 6.04V4.67a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ ...box, fill: "currentColor" }} aria-hidden="true" role="presentation" focusable="false">
      <path d="M28 2h-6V0h-2v2h-8V0h-2v2H4a2 2 0 0 0-2 2v21a5 5 0 0 0 5 5h12.59a2.01 2.01 0 0 0 1.41-.59L29.41 21a2.01 2.01 0 0 0 .59-1.41V4a2 2 0 0 0-2-2Zm-8 25.59V23a3 3 0 0 1 3-3h4.59ZM28 10H4v2h24v6h-5a5 5 0 0 0-5 5v5H7a3 3 0 0 1-3-3V4h6v2h2V4h8v2h2V4h6Z" />
    </svg>
  );
}

export function ListingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ ...stroke, strokeWidth: 2 }} aria-hidden="true" role="presentation" focusable="false">
      <path d="m7 3h18c2.2091 0 4 1.79086 4 4v18c0 2.2091-1.7909 4-4 4h-18c-2.20914 0-4-1.7909-4-4v-18c0-2.20914 1.79086-4 4-4z" />
      <path d="m9 9h6" />
    </svg>
  );
}

export function MessagesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ ...stroke, strokeWidth: 2 }} aria-hidden="true" role="presentation" focusable="false">
      <path d="m25.5 3.5c2.2091 0 4 1.79086 4 4v13.8333c0 2.2092-1.7909 4-4 4h-5.8192l-3.6808 4.5-3.6832-4.5h-5.8168c-2.20914 0-4-1.7908-4-4v-13.8333c0-2.20914 1.79086-4 4-4z" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} style={{ ...stroke, strokeWidth: 2.6666666666666665 }} aria-hidden="true" role="presentation" focusable="false">
      <path d="M2 16h28M2 24h28M2 8h28" />
    </svg>
  );
}
