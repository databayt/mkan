import React from 'react';
import Image from 'next/image';

interface AirbnbIconProps {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}

const AirbnbIcon: React.FC<AirbnbIconProps> = ({
  name,
  className = "",
  size = 24,
  style = {}
}) => {
  const iconPath = `/assets/${name}.svg`;

  return (
    <Image
      src={iconPath}
      alt={name}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={style}
    />
  );
};

export default AirbnbIcon;