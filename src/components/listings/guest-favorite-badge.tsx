import React from "react";

/**
 * "Guest favorite" pill overlaid on listing-card images — pixel-matched to the
 * live Airbnb search card (probed 2026-07-06): 28px inline-flex pill, 4×10
 * padding, 40px radius, 1px white border, near-white diagonal gradient fill,
 * 0 4px 10px rgba(0,0,0,.16) shadow, 14px/18px medium black label. Airbnb
 * insets it 12px from the inline-start edge and 14px from the top of the
 * image; `overlay` bakes that positioning in (logical `start` so RTL flips).
 */
export default function GuestFavoriteBadge({
  label = "Guest favorite",
  overlay = true,
}: {
  label?: string;
  /** Absolutely position inside the card image (default). False renders in-flow. */
  overlay?: boolean;
}) {
  return (
    <div
      className={
        overlay
          ? "pointer-events-none absolute top-3.5 start-3 z-10 inline-flex items-center"
          : "inline-flex items-center"
      }
      style={{
        height: 28,
        padding: "4px 10px",
        borderRadius: 40,
        border: "1px solid #ffffff",
        backgroundImage:
          "linear-gradient(to right top, #F1F1F1 0%, #FFFFFF 11%, #FFFFFF 70%, #EFEFEF 94%)",
        boxShadow: "rgba(0, 0, 0, 0.16) 0px 4px 10px 0px",
      }}
    >
      <span
        className="whitespace-nowrap font-medium"
        style={{ fontSize: 14, lineHeight: "18px", color: "#000000" }}
      >
        {label}
      </span>
    </div>
  );
}
