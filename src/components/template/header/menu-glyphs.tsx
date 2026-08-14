/**
 * Shared account-menu glyphs, all drawn in Airbnb's exact DLS convention
 * measured from the live site (airbnb.com): viewBox "0 0 32 32", fill:none,
 * stroke:currentColor, stroke-width 2, round caps/joins — rendered at one
 * uniform size so every row's glyph has identical optical weight.
 *
 * WishlistGlyph is Airbnb's literal "Save to wishlist" heart lifted verbatim
 * from their listing cards; HelpGlyph is the authentic "?" from the guest
 * menu. The rest are login-gated on Airbnb so they're redrawn in the same
 * 32-grid DLS style to match the heart's weight. Used by the desktop account
 * dropdown (listings-header) and the mobile menu sheet.
 */

import React from "react";

export const StrokeGlyph = ({
  size = 20,
  children,
}: {
  size?: number;
  children: React.ReactNode;
}) => (
  <svg
    viewBox="0 0 32 32"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    className="flex-shrink-0"
    style={{
      display: "block",
      height: size,
      width: size,
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      overflow: "visible",
    }}
  >
    {children}
  </svg>
);

export const WishlistGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="m15.9998 28.6668c7.1667-4.8847 14.3334-10.8844 14.3334-18.1088 0-1.84951-.6993-3.69794-2.0988-5.10877-1.3996-1.4098-3.2332-2.11573-5.0679-2.11573-1.8336 0-3.6683.70593-5.0668 2.11573l-2.0999 2.11677-2.0988-2.11677c-1.3995-1.4098-3.2332-2.11573-5.06783-2.11573-1.83364 0-3.66831.70593-5.06683 2.11573-1.39955 1.41083-2.09984 3.25926-2.09984 5.10877 0 7.2244 7.16667 13.2241 14.3333 18.1088z" />
  </StrokeGlyph>
);

export const TripsGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="M7 11h18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z" />
    <path d="M11 11V8a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
    <path d="M16 16v6" />
  </StrokeGlyph>
);

export const ProfileGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <circle cx="16" cy="11" r="5.5" />
    <path d="M5.5 27a10.5 10.5 0 0 1 21 0" />
  </StrokeGlyph>
);

export const AccountGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="M5 11h12" />
    <path d="M22 11h5" />
    <circle cx="19.5" cy="11" r="2.6" />
    <path d="M5 21h5" />
    <path d="M15 21h12" />
    <circle cx="12.5" cy="21" r="2.6" />
  </StrokeGlyph>
);

export const LogoutGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="M12 6H8a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4" />
    <path d="M20 21l5-5-5-5" />
    <path d="M25 16H11" />
  </StrokeGlyph>
);

export const GlobeGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <circle cx="16" cy="16" r="12.5" />
    <path d="M3.5 16h25" />
    <path d="M16 3.5c4 3.6 6 8.1 6 12.5s-2 8.9-6 12.5c-4-3.6-6-8.1-6-12.5s2-8.9 6-12.5z" />
  </StrokeGlyph>
);

export const ReferGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="M6 12h20v4H6z" />
    <path d="M8 16v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" />
    <path d="M16 12v15" />
    <path d="M16 12s-1.6-6-5.5-6C8.2 6 7 7.4 7 9s1.2 3 3.5 3z" />
    <path d="M16 12s1.6-6 5.5-6C23.8 6 25 7.4 25 9s-1.2 3-3.5 3z" />
  </StrokeGlyph>
);

export const CoHostGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <circle cx="11" cy="11.5" r="4.5" />
    <path d="M3 27a8 8 0 0 1 16 0" />
    <circle cx="22.5" cy="13" r="3.5" />
    <path d="M22 27h7a7 7 0 0 0-6-6.9" />
  </StrokeGlyph>
);

export const GiftCardGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <rect x="4" y="8" width="24" height="17" rx="2" />
    <path d="M4 14h24" />
    <path d="M9 20.5h7" />
  </StrokeGlyph>
);

// Help "?" — authentic Airbnb glyph (fill, viewBox 0 0 16 16) lifted verbatim
// from the live guest menu; rendered slightly smaller than the stroke glyphs so
// its solid disc reads the same optical size.
export const HelpGlyph = ({ size = 18 }: { size?: number }) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    className="flex-shrink-0"
    style={{ display: "block", height: size, width: size, fill: "currentColor" }}
  >
    <path d="m8 0c4.4183 0 8 3.58172 8 8 0 4.4183-3.5817 8-8 8-4.41828 0-8-3.5817-8-8 0-4.41828 3.58172-8 8-8zm0 1.5c-3.58985 0-6.5 2.91015-6.5 6.5 0 3.5899 2.91015 6.5 6.5 6.5 3.5899 0 6.5-2.9101 6.5-6.5 0-3.58985-2.9101-6.5-6.5-6.5zm0 9.25c.55229 0 1 .4477 1 1s-.44771 1-1 1c-.55228 0-1-.4477-1-1s.44772-1 1-1zm.06473-7.58398c1.52426 0 2.97397 1.05548 2.97397 2.83411 0 1.65987-1.22457 2.54665-2.28686 2.96686l-.00274 1.03511-1.49999-.00395.00567-2.14403.55088-.15046c.98777-.26979 1.73306-.83193 1.73306-1.70353 0-.78691-.60484-1.33411-1.47399-1.33411-.71208 0-1.32461.47156-1.52734 1.17921l-1.44199-.41312c.37855-1.32132 1.55747-2.26609 2.96933-2.26609z" />
  </svg>
);

// Bus — the Travel vertical's row in both menus. Redrawn on the same 32-grid
// as the stroke glyphs above (Airbnb has no transport equivalent to lift), so
// its optical weight matches Wishlists/Trips/Gift cards sitting beside it:
// a windscreen-split body, two wheels, and the destination board.
export const BusGlyph = ({ size = 20 }: { size?: number }) => (
  <StrokeGlyph size={size}>
    <path d="M6 6h20a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
    <path d="M4 13h24" />
    <path d="M16 6v7" />
    <path d="M9 24v2.5" />
    <path d="M23 24v2.5" />
    <path d="M8.5 19h1" />
    <path d="M22.5 19h1" />
  </StrokeGlyph>
);
