import React from "react";
import { cdn } from "@/lib/cdn";

interface AirbnbIconProps {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

// Plain <img> is intentional: these are static decorative SVGs in /public/assets.
// next/image collides with Tailwind preflight (`img { height: auto }`) and the
// attribute-based sizing it relies on, producing aspect-ratio warnings.
const AirbnbIcon: React.FC<AirbnbIconProps> = ({ name, className = "", size = 24, style = {} }) => {
  const iconPath = cdn.product(`assets/${name}.svg`);

  return (
    <img
      src={iconPath}
      alt={name}
      width={size}
      height={size}
      // Decorative: low priority also stops React preloading every icon in
      // the shell, which raced the hero for the first bytes.
      fetchPriority="low"
      className={`inline-block ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
    />
  );
};

export default AirbnbIcon;
