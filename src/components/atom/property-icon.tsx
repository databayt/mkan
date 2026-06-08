import React from 'react';

interface AirbnbIconProps {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

// Plain <img> is intentional: these are static decorative SVGs in /public/assets.
// next/image collides with Tailwind preflight (`img { height: auto }`) and the
// attribute-based sizing it relies on, producing aspect-ratio warnings.
const AirbnbIcon: React.FC<AirbnbIconProps> = ({
  name,
  className = "",
  size = 24,
  style = {}
}) => {
  const iconPath = `/assets/${name}.svg`;

  return (
    <img
      src={iconPath}
      alt={name}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
    />
  );
};

export default AirbnbIcon;