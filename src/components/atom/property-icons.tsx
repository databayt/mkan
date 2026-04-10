import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  fill?: string;
}

export const CalendarCheck: React.FC<IconProps> = ({ 
  size = 32, 
  className = '', 
  fill = 'currentColor' 
}) => (
  <svg 
    viewBox="0 0 32 32" 
    xmlns="http://www.w3.org/2000/svg" 
    aria-hidden="true" 
    role="presentation" 
    focusable="false" 
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="m12 0v2h8v-2h2v2h6c1.1045695 0 2 .8954305 2 2v21c0 2.7614237-2.2385763 5-5 5h-18c-2.76142375 0-5-2.2385763-5-5v-21c0-1.1045695.8954305-2 2-2h6v-2zm16 11.5h-24v13.5c0 1.6568542 1.34314575 3 3 3h18c1.6568542 0 3-1.3431458 3-3zm-5.5 2.5857864 1.4142136 1.4142136-9.2826347 9.2826346-5.04579246-5.0457925 1.41421356-1.4142136 3.631 3.6313715zm-12.5-10.0857864h-6v5.5h24v-5.5h-6v2h-2v-2h-8v2h-2z"></path>
  </svg>
);

export const LightningBolt: React.FC<IconProps> = ({ 
  size = 32, 
  className = '', 
  fill = 'currentColor' 
}) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 32 32" 
    aria-hidden="true" 
    role="presentation" 
    focusable="false" 
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M17.16 1.46 6.19 17.42l-.1.17c-.05.12-.06.18-.08.4l.04.13c.19.65.23.67.97.88H13v10.97l.04.22c.05.28.1.33.4.61l.27.09c.51.16.59.1 1.13-.35l10.97-15.96.1-.18c.05-.11.06-.17.08-.39l-.04-.13c-.19-.66-.23-.67-.97-.88H19V2.03l-.04-.22c-.05-.28-.1-.33-.4-.61l-.27-.09c-.51-.16-.59-.1-1.13.35zM17 5.22V15h6.1L15 26.78V17H8.9L17 5.22z"></path>
  </svg>
);

export const WiFi: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M16 20.3c-1.3 0-2.4 1.1-2.4 2.4s1.1 2.4 2.4 2.4c1.3 0 2.4-1.1 2.4-2.4s-1.1-2.4-2.4-2.4zm0 4c-.9 0-1.6-.7-1.6-1.6s.7-1.6 1.6-1.6 1.6.7 1.6 1.6-.7 1.6-1.6 1.6zm4.8-4.8C19.4 18.1 17.8 17 16 17s-3.4 1.1-4.8 2.5l-.8-.8c1.7-1.7 3.8-2.6 6.1-2.6s4.4 1 6.1 2.6l-.8.8zm3.2-3.2c-2.2-2.2-5.1-3.4-8.2-3.4s-6 1.2-8.2 3.4l-.8-.8c2.5-2.5 5.7-3.8 9-3.8s6.5 1.3 9 3.8l-.8.8z"></path>
  </svg>
);

export const TV: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M9 29v-2h2v-2H6a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-5v2h2v2zm11-4h-8v2h8zm-10-4h20a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3z"></path>
  </svg>
);

export const Kitchen: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M26 1a5 5 0 0 1 5 5c0 6.389-1.592 13.187-4 14.693V31h-2V20.694c-2.364-1.478-3.942-8.062-3.998-14.349L21 6l.005-.217A5 5 0 0 1 26 1zm-9 0v18.118c2.317.557 4 3.01 4 5.882 0 3.27-2.183 6-5 6s-5-2.73-5-6c0-2.872 1.683-5.326 4-5.882V1zM2 1h1c4.47 0 6.934 6.365 6.999 18.505L10 21H3.999L4 31H2zm14 20c-1.602 0-3 1.748-3 4s1.398 4 3 4 3-1.748 3-4-1.398-4-3-4zM4 3.239V19h3.995l-.017-.964-.027-.949C7.673 9.157 6.235 4.623 4.224 3.364l-.12-.07zm19.005 2.585L23 6l.002.31c.045 4.321 1.031 9.133 1.999 11.39V3.17a3.002 3.002 0 0 0-1.996 2.654zm3.996-2.653v14.526c.97-2.257 1.959-7.069 2.001-11.39L29 6l-.002-.31a3.002 3.002 0 0 0-1.997-2.654z"></path>
  </svg>
);

export const Washer: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M28 2a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2H4v24h24zM16 7a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM7 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"></path>
  </svg>
);

export const FreeParking: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M26 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm20.693-5l.42 1.119C29.253 15.036 30 16.426 30 18v9c0 1.103-.897 2-2 2h-2c-1.103 0-2-.897-2-2v-2H8v2c0 1.103-.897 2-2 2H4c-1.103 0-2-.897-2-2v-9c0-1.575.746-2.965 1.888-3.882L4.308 13H2v-2h3v.152l1.82-4.854A2.009 2.009 0 0 1 8.693 5h14.614c.829 0 1.58.521 1.873 1.297L27 11.151V11h3v2h-2.307zM6 25H4v2h2v-2zm22 0h-2v2h2v-2zm0-2v-5c0-1.654-1.346-3-3-3H7c-1.654 0-3 1.346-3 3v5h24zm-3-10h.557l-2.25-6H8.693L6.443 13H25z"></path>
  </svg>
);

export const AirConditioning: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M17 1v4.03l4.026-2.324 1 1.732L17 7.339v6.928l6-3.464V5h2v4.648l3.49-2.014 1 1.732L26 11.381l4.026-2.324 1 1.732L27 13.689v4.642l4.026-2.324 1 1.732L28 20.631v4.64l4.026-2.324 1 1.732L29 27.579V31h-2v-2.535l-4 2.309v-4.618l-6-3.464v6.928l4.026-2.324 1 1.732L17 32.97V37h-2v-4.03l-4.026 2.324-1-1.732L15 30.661v-6.928l-6 3.464V32H7v-4.648l-3.49 2.014-1-1.732L6 25.619l-4.026 2.324-1-1.732L5 23.311v-4.642l-4.026 2.324-1-1.732L4 16.369v-4.64l-4.026 2.324-1-1.732L3 9.421V6H5v2.535l4-2.309v4.618l6 3.464V7.38l-4.026 2.324-1-1.732L15 5.07V1h2zm0 15.526v-6.928l-6-3.464v6.928l6 3.464z"></path>
  </svg>
);

export const DedicatedWorkspace: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M26 2a1 1 0 0 1 .922.612l.04.113 2 7a1 1 0 0 1-.847 1.269L28 11h-3v5h6v2h-2v13h-2l.001-2.536a3.976 3.976 0 0 1-1.73.527L25 29H7a3.982 3.982 0 0 1-2-.535V31H3V18H1v-2h5v-4a1 1 0 0 1 .883-.993L7 11h.238L6.086 8.406l1.828-.812L9.427 11H12a1 1 0 0 1 .993.883L13 12v4h10v-5h-3a1 1 0 0 1-.987-1.162l.025-.113 2-7a1 1 0 0 1 .842-.718L22 2h4zm1 16H5v7a2 2 0 0 0 1.697 1.977l.154.018L7 27h18a2 2 0 0 0 1.995-1.85L27 25v-7zm-16-5H8v3h3v-3zm14.245-9h-2.491l-1.429 5h5.349l-1.429-5z"></path>
  </svg>
);

export const EntirePlace: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, stroke: fill, fill: 'none' }}
    className={className}
  >
    <g strokeWidth="2">
      <path d="M16 2l12 10v16h-8v-8H12v8H4V12z" />
      <path d="M12 14v8h8v-8z" />
    </g>
  </svg>
);

export const PrivateRoom: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, stroke: fill }}
    className={className}
  >
    <g strokeWidth="2" fill="none">
      <path d="M10 5v22h12V5zM10 14h12" />
      <circle cx="16" cy="17" r="1.5" fill={fill} stroke="none" />
    </g>
  </svg>
);

export const SharedRoom: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, stroke: fill }}
    className={className}
  >
    <g strokeWidth="2" fill="none">
      <path d="M4 8v16h24V8zM4 16h24" />
      <path d="M12 8v8M20 16v8" />
      <g fill={fill} stroke="none">
        <circle cx="8" cy="12" r="1.5" />
        <circle cx="16" cy="20" r="1.5" />
        <circle cx="24" cy="12" r="1.5" />
      </g>
    </g>
  </svg>
);

export const MailEnvelope: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M16 2.28l.18.16L29.2 15.29l-1.4 1.42-1.8-1.76V27.5c0 1.05-.82 1.92-1.85 2l-.15.01H4c-1.05 0-1.92-.82-2-1.85L2 27.5V15.44l-1.8 1.76-1.4-1.42L11.86 2.44c1.11-1.14 2.91-1.2 4.1-.18zm-1.37 1.5l-.1.09-9.27 9.1V27.5h5V17.5c0-1.05.82-1.92 1.85-2l.15-.01h6c1.05 0 1.92.82 2 1.85l.01.15V27.5h5V12.99l-9.3-9.14c-.36-.36-.93-.38-1.33-.07zM17 17.5h-6v10h6v-10z"></path>
  </svg>
);

export const GridCalendar: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M12 5v2h8V5h2v2h6a2 2 0 012 2v21a5 5 0 01-5 5H7a5 5 0 01-5-5V9a2 2 0 012-2h6V5h2zm16 11.5H4v13.5a3 3 0 003 3h18a3 3 0 003-3V16.5zM28 9H4v5.5h24V9zm-6 9a1 1 0 110 2 1 1 0 010-2zm-4-4a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2zm8 4a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2zm8 4a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2zm-4 0a1 1 0 110 2 1 1 0 010-2z"></path>
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill: 'none', stroke: fill, strokeWidth: 2 }}
    className={className}
  >
    <path d="M15 15h-12v-12h24v24h-12v-12z" />
    <path d="M3 3l26 26M29 3L3 29" />
  </svg>
);

export const WavePattern: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M9.334 20c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
    <path d="M9.334 14c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
    <path d="M9.334 26c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
  </svg>
);

export const NetworkRouter: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M9.333 20c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
    <path d="M9.334 14c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
    <path d="M9.334 26c1.119 0 2.201-.41 3.016-1.175.438-.411 1.03-.636 1.65-.636s1.212.225 1.65.636c.815.765 1.897 1.175 3.016 1.175 1.039 0 2.047-.354 2.838-1.017l.179-.159c.439-.411 1.03-.636 1.65-.636.62 0 1.211.225 1.65.636.758.71 1.745 1.116 2.777 1.17l.24.006v-2c-.551 0-1.079-.178-1.498-.506l-.152-.13c-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175-.438.411-1.03.636-1.65.636s-1.212-.225-1.65-.636c-.816-.765-1.898-1.175-3.017-1.175-1.119 0-2.201.41-3.016 1.175-.438.411-1.03.636-1.65.636-.62 0-1.212-.225-1.65-.636-.816-.765-1.898-1.175-3.017-1.175-1.12 0-2.202.41-3.018 1.175l-.152.13c-.419.328-.947.506-1.498.506v2c.24 0 .472-.022.694-.064.758-.71 1.745-1.116 2.777-1.17l.24-.006c.62 0 1.211.225 1.65.636.816.765 1.898 1.175 3.017 1.175 3.016 1.175z"></path>
  </svg>
);

export const FloorPlanIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <g transform="translate(1, 8) scale(0.71)">
      <path d="M11.5-4.2v-7.1h1v9.1l.15.15L15.5.5l-.71.71-1.65-1.65L12.5-.6v1.2c0 .64-.24 1.22-.64 1.66l-.3.33.3.34c.37.41.6.93.63 1.51v5.2c0 .64-.24 1.22-.64 1.66l-.3.33.3.34c.37.41.6.93.63 1.51v1c0 1.33-1.04 2.42-2.35 2.5H-10c-1.33 0-2.42-1.04-2.5-2.35v-1c0-.64.24-1.22.64-1.66l.3-.33-.3-.34c-.37-.41-.6-.93-.63-1.51v-5.2c0-.64.24-1.22.64-1.66l.3-.33-.3-.34c-.37-.41-.6-.93-.63-1.51v-1c0-.64.24-1.22.64-1.66l.3-.33-.3-.34c-.35-.4-.57-.91-.61-1.47v-1.8l-1.15 1.15-1.65-1.65L-15 .5l13.23-13.23c.94-1.04 2.49-1.07 3.35-.21l.13.13 8.87 8.87.85.85v-1.2zM-4.5 9.2v-.5h-.5v-4h-4.5c-.77 0-1.4.58-1.49 1.33v.02c0 .01-.01.01-.01.02v.13c0 .01-.01.01-.01.02v1c0 .77.58 1.4 1.33 1.49h4.64c.01 0 .01 0 .02.01h.01v3.5h.5v-3.5zM3.5 3.2v-.5h-.5v-6h-6.5v-.5h-.5v.5v9h.5v.5h6.5v.5h.5v-.5v-3zM10.03 8.71c-.01 0-.02 0-.03-.01h-5v-.5h-.5v.5v3h.5v.5h5c.77 0 1.4-.58 1.49-1.33v-.01c0-.01.01-.01.01-.02v-.13c0-.01.01-.01.01-.02v-1c0-.77-.58-1.4-1.33-1.49h-.16zM10.03 3.71c-.01 0-.02 0-.03-.01h-5v-.5h-.5v.5v3h.5v.5h5c.77 0 1.4-.58 1.49-1.33v-.01c0-.01.01-.01.01-.02v-.13c0-.01.01-.01.01-.02v-1c0-.77-.58-1.4-1.33-1.49h-.16zM-4.5 4.2v-.5h-.5v-4h-4.5c-.77 0-1.4.58-1.49 1.33v.02c0 .01-.01.01-.01.02v.13c0 .01-.01.01-.01.02v1c0 .77.58 1.4 1.33 1.49h4.64c.01 0 .01 0 .02.01h.01v1.5h.5v-1.5zM-11.49.03v.02c0 .01-.01.01-.01.02v.13c0 .01-.01.01-.01.02v1c0 .77.58 1.4 1.33 1.49h4.64l.17.17c.24.42.68.71 1.18.75h.12h5c.55 0 1.04-.3 1.3-.75l.15-.17h4.73c.77 0 1.4-.58 1.49-1.33v-.01c0-.01.01-.01.01-.02v-.13c0-.01.01-.01.01-.02v-1c0-.77-.58-1.4-1.33-1.49h-4.64l-.17-.17c-.24-.42-.68-.71-1.18-.75h-10c-.77 0-1.4.58-1.49 1.33zM6.94-6.15l-.15-.15h-.21h-13.17l-.21.21-3 3-.85.85v1.21h1.21v-1.21h19.17v1.21h1.21v-1.21l-.85-.85-3-3zM-.92-12.15l-.01-.01-.01-.01-.09-.09-.01-.01-.01-.01-3.88 3.88-.85.85v1.21h1.21v-1.21h9.17v1.21h1.21v-1.21l-.85-.85-3.88-3.88c-.54-.54-1.39-.58-1.98-.12z" />
    </g>
  </svg>
);

export const FurnitureLayoutIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <g transform="translate(1.5,6) scale(0.71)">
      <path d="M13-14c.51 0 .99.19 1.36.53.37.36.63.87.63 1.38v12c0 .51-.19.99-.53 1.36-.36.37-.87.63-1.38.63H-13c-.51 0-.99-.19-1.36-.53-.37-.36-.63-.87-.63-1.38v-9h-2v2h-2v-2h-2v9c0 .51.19.99.53 1.36.36.37.87.63 1.38.63h24v-9c0-1.04.41-2.05 1.13-2.79.73-.74 1.72-1.17 2.76-1.2 1.04-.03 2.05.36 2.81 1.07.77.71 1.23 1.69 1.28 2.73v3h2v-9c0-.51-.19-.99-.53-1.36-.36-.37-.87-.63-1.38-.63h-24v-2h2v-2h2v2h2v-12c0-.51.19-.99.53-1.36.36-.37.87-.63 1.38-.63h26zm-2 11h-24v9h2v-3c0-1.04.41-2.05 1.13-2.79.73-.74 1.72-1.17 2.76-1.2 1.04-.03 2.05.36 2.81 1.07.77.71 1.23 1.69 1.28 2.73v3h2v-3c0-1.04.41-2.05 1.13-2.79.73-.74 1.72-1.17 2.76-1.2 1.04-.03 2.05.36 2.81 1.07.77.71 1.23 1.69 1.28 2.73v3h2v-9zm-8-8h-6v-.5h-.5v.5v9h.5v.5h6v.5h.5v-.5v-9h-.5v-.5zm5-4h-5v-.5h-.5v.5v3h.5v.5h5v.5h.5v-.5v-3h-.5v-.5zm-10 0h-5v-.5h-.5v.5v3h.5v.5h5v.5h.5v-.5v-3h-.5v-.5zm13-2h-26v2h26v-2z" />
    </g>
  </svg>
);

export const AddHomeIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M31.7 15.3 29 12.58 18.12 1.7a3.07 3.07 0 0 0-4.24 0L3 12.59l-2.7 2.7 1.4 1.42L3 15.4V28a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V15.41l1.3 1.3ZM27 28H5V13.41L15.3 3.12a1 1 0 0 1 1.4 0L27 13.42ZM17 12v5h5v2h-5v5h-2v-5h-5v-2h5v-5Z" />
  </svg>
);

export const DocumentIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M25 5a4 4 0 0 1 4 4v17a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5h13zm0 2H12a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9a2 2 0 0 0-2-2zm-3-6v2H11a6 6 0 0 0-6 5.78V22H3V9a8 8 0 0 1 7.75-8H22z" />
  </svg>
);

export const CalendarCheckmark: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="m12 0v2h8v-2h2v2h6c1.1045695 0 2 .8954305 2 2v21c0 2.7614237-2.2385763 5-5 5h-18c-2.76142375 0-5-2.2385763-5-5v-21c0-1.1045695.8954305-2 2-2h6v-2zm16 11.5h-24v13.5c0 1.6568542 1.34314575 3 3 3h18c1.6568542 0 3-1.3431458 3-3zm-5.5 2.5857864 1.4142136 1.4142136-9.2826347 9.2826346-5.04579246-5.0457925 1.41421356-1.4142136 3.631 3.6313715zm-12.5-10.0857864h-6v5.5h24v-5.5h-6v2h-2v-2h-8v2h-2z" />
  </svg>
);

export const LightningBoltIcon: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M17.16 1.46 6.19 17.42l-.1.17c-.05.12-.06.18-.08.4l.04.13c.19.65.23.67.97.88H13v10.97l.04.22c.05.28.1.33.4.61l.27.09c.51.16.59.1 1.13-.35l10.97-15.96.1-.18c.05-.11.06-.17.08-.39l-.04-.13c-.19-.66-.23-.67-.97-.88H19V2.03l-.04-.22c-.05-.28-.1-.33-.4-.61l-.27-.09c-.51-.16-.59-.1-1.13.35zM17 5.22V15h6.1L15 26.78V17H8.9L17 5.22z" />
  </svg>
);

export const ListView: React.FC<IconProps> = ({
  size = 12,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Change to List view"
    role="img"
    focusable="false"
    style={{ display: 'block', fill: 'none', height: `${size}px`, width: `${size}px`, stroke: fill, strokeWidth: 2, overflow: 'visible' }}
    className={className}
  >
    <path d="m29 19v10h-26v-10zm0-16v10h-26v-10z" strokeLinejoin="round" fill="none" />
  </svg>
);

export const GridView: React.FC<IconProps> = ({
  size = 12,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-label="Change to grid view"
    role="img"
    focusable="false"
    style={{ display: 'block', fill: 'none', height: `${size}px`, width: `${size}px`, stroke: fill, strokeWidth: 2, overflow: 'visible' }}
    className={className}
  >
    <path d="m13 19v10h-10v-10zm16 0v10h-10v-10zm-16-16v10h-10v-10zm16 0v10h-10v-10z" fill="none" strokeLinejoin="round" />
  </svg>
);

export const Peaceful: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M22 2a7 7 0 0 1 6.98 6.52l.02.24V16a2 2 0 0 1-1.34 1.89l-.16.05-.5.13V25a5 5 0 0 1-10 .22V18h-2v7a5 5 0 0 1-10 .22v-7.16l-.5-.12A2 2 0 0 1 3 16.15V8.74a7 7 0 0 1 13-3.35A7 7 0 0 1 22 2zM10 16a6.98 6.98 0 0 0-3 .67V25a3 3 0 0 0 6 .18v-8.51a6.98 6.98 0 0 0-3-.67zm12 0a6.98 6.98 0 0 0-3 .67V25a3 3 0 0 0 6 .18v-8.51a6.97 6.97 0 0 0-3-.67zm0-4c-1.76 0-3.47.42-5 1.2v2.32l.08-.06a8.96 8.96 0 0 1 4.23-1.43l.36-.02L22 14a8.96 8.96 0 0 1 4.54 1.23l.29.17.17.12V13.2a10.95 10.95 0 0 0-5-1.2zm-12 0c-1.76 0-3.47.42-5 1.2v2.32l.17-.12a8.95 8.95 0 0 1 4.14-1.37l.34-.02L10 14c1.66 0 3.25.45 4.63 1.28l.29.18.08.06V13.2a10.95 10.95 0 0 0-5-1.2zm12-8a5 5 0 0 0-4.98 4.57L17 8.8V11a12.97 12.97 0 0 1 5-1c1.74 0 3.43.34 5 1V8.82A5 5 0 0 0 22 4zM10 4a5 5 0 0 0-4.98 4.57L5 8.8V11a12.97 12.97 0 0 1 5-1c1.74 0 3.43.34 5 1V8.8a5 5 0 0 0-4.78-4.8z"></path>
  </svg>
);

export const Unique: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="m16.6 1.2.1.08.08.1L20.48 6H22v2h-2v4h2v2h-1.76l1.65 14H26v2H6v-2h4.11l1.65-14H10v-2h2V8h-2V6h1.52l3.7-4.63a1 1 0 0 1 1.38-.17zM18.23 14h-4.46l-1.65 14h7.76zM16 23a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0-5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-9.54-4.88 1.42 1.42-2.83 2.82-1.41-1.41zm19.08 0 2.82 2.83-1.41 1.41-2.83-2.82zM18 8h-4v4h4zM5 9v2H1V9zm26 0v2h-4V9zM5.05 2.64l2.83 2.82-1.42 1.42-2.82-2.83zm21.9 0 1.41 1.41-2.82 2.83-1.42-1.42zM16 3.6 14.08 6h3.84z"></path>
  </svg>
);

export const Stylish: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M29 2v10a2 2 0 0 1-1.66 1.97L27 14h-1.03l2.73 10.18a42.58 42.58 0 0 0 1.68-1.23l1.25 1.56A24.9 24.9 0 0 1 16 30 24.9 24.9 0 0 1 .78 24.83l-.4-.31 1.25-1.56c.61.5 1.25.95 1.91 1.38L7.45 10c-1.2 0-2.31.88-2.7 2.04L3.7 16H1.62l1.15-4.3A5 5 0 0 1 7.37 8H18.07l.04-.22a7 7 0 0 1 6.15-5.74l.25-.02.25-.02H25zM17 20v2h-2v-2h-4.1l-1.86 6.93A23.01 23.01 0 0 0 16 28a23 23 0 0 0 7.2-1.15L21.37 20zm-5-10H9.44L5.32 25.37c.6.32 1.2.6 1.83.87L9.36 18H15v-2.13a4 4 0 0 1-3-3.67zm15-6h-2.18a5 5 0 0 0-4.8 4.58L20 8.8V12a4 4 0 0 1-3 3.87V18h5.9l2.18 8.14a22.85 22.85 0 0 0 1.84-.89L23.36 12 22.3 8h2.07l1.07 4H27zm-9 6h-4v2a2 2 0 0 0 2 2c1.05 0 2-.9 2-2z"></path>
  </svg>
);

export const Spacious: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="m7.40613847 1.08618845 16.59386153 7.37468521v-6.46087366h2v24.9998737l4 .0001263v2l-4-.0001263v2.0001263h-2v-2.0001263h-16v2.0001263h-2v-2.0001263l-4 .0001263v-2l4-.0001263v-24.9998737c0-.72365839.74485107-1.20771706 1.40613847-.91381155zm.59386153 2.45181155v23.462h3v-11c0-1.1045695.8954305-2 2-2h6c1.1045695 0 2 .8954305 2 2v11h3v-16.351zm11 21.4618737h-6v2h6zm0-8.9998737h-6v6.9998737h6zm-8-8c.5522847 0 1 .44771525 1 1s-.4477153 1-1 1-1-.44771525-1-1 .4477153-1 1-1z"></path>
  </svg>
);

export const Central: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M16 0a12 12 0 0 1 12 12c0 6.34-3.81 12.75-11.35 19.26l-.65.56-1.08-.93C7.67 24.5 4 18.22 4 12 4 5.42 9.4 0 16 0zm0 2C10.5 2 6 6.53 6 12c0 5.44 3.25 11.12 9.83 17.02l.17.15.58-.52C22.75 23 25.87 17.55 26 12.33V12A10 10 0 0 0 16 2zm0 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"></path>
  </svg>
);

export const FamilyFriendly: React.FC<IconProps> = ({
  size = 32,
  className = '',
  fill = 'currentColor'
}) => (
  <svg
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    role="presentation"
    focusable="false"
    style={{ display: 'block', height: `${size}px`, width: `${size}px`, fill }}
    className={className}
  >
    <path d="M22 7a5 5 0 0 1 3.4 8.67 9 9 0 0 1 5.6 8.06V24h-2a7 7 0 0 0-6-6.93v-2.24a3 3 0 1 0-4-3V12l.08.06a5 5 0 0 1 .32 7.6 9 9 0 0 1 5.6 8.07V28h-2a7 7 0 0 0-6-6.93v-2.24a3 3 0 1 0-2 0v2.24a7 7 0 0 0-6 6.69V28H7a9 9 0 0 1 5.6-8.34 4.98 4.98 0 0 1 .32-7.6L13 12a3 3 0 1 0-4 2.83v2.24a7 7 0 0 0-6 6.69V24H1a9 9 0 0 1 5.6-8.34A4.98 4.98 0 0 1 10 7a5 5 0 0 1 4.92 4.12 4.98 4.98 0 0 1 2.16 0A5 5 0 0 1 22 7z"></path>
  </svg>
);
