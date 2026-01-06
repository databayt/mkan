"use client";

import { FC } from 'react';

interface AppHeaderOptionProps {
  children: React.ReactNode;
  isSnap?: boolean;
  isActiveHeader?: boolean;
  active?: boolean;
  onClick?: () => void;
}

const AppHeaderOption: FC<AppHeaderOptionProps> = ({
  children,
  isSnap = false,
  active = false,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 
        text-sm font-medium 
        transition-colors duration-200 
        cursor-pointer
        ${isSnap ? 'text-white hover:bg-white/10' : 'text-gray-800 hover:bg-gray-100'}
        ${active ? 'border-b-2 border-current' : ''}
      `}
    >
      {children}
    </button>
  );
};

export default AppHeaderOption;
