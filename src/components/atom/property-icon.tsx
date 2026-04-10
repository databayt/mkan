import React from 'react';

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
    <img 
      src={iconPath} 
      alt={name}
      className={`inline-block ${className}`}
      style={{ 
        width: size, 
        height: size,
        ...style
      }}
    />
  );
};

export default AirbnbIcon; 