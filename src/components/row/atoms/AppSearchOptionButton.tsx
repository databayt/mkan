"use client";

import { FocusEvent, ReactNode, ChangeEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppSearchOptionButtonProps {
  children?: ReactNode;
  title: string;
  placeholder: string;
  value?: string;
  active?: boolean;
  separator?: boolean;
  relative?: boolean;
  withSearch?: boolean;
  isSearch?: boolean;
  type?: 'input' | 'inputText' | 'button';
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  onBlur?: (event?: FocusEvent<HTMLElement>) => void;
  onClear?: () => void;
  onSearch?: () => void;
}

const AppSearchOptionButton = ({
  children,
  title,
  placeholder,
  value,
  active = false,
  separator = false,
  relative = false,
  withSearch = false,
  type = 'button',
  onChange,
  onFocus,
  onBlur,
  onClear,
  onSearch
}: AppSearchOptionButtonProps) => {
  return (
    <div className={cn(
      'relative',
      separator && 'border-r border-gray-200'
    )}>
      <div className={cn(
        'px-6 py-4',
        active && 'bg-white rounded-full shadow-lg'
      )}>
        {/* Label */}
        <label className="block text-xs font-semibold text-gray-800 mb-1">
          {title}
        </label>

        {/* Input or Button */}
        {(type === 'input' || type === 'inputText') ? (
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange?.(e)}
            className="w-full text-sm text-gray-600 placeholder-gray-400 bg-transparent border-none outline-none"
            onFocus={onFocus}
            onBlur={onBlur}
          />
        ) : (
          <button
            onClick={onFocus}
            onBlur={onBlur}
            className="w-full text-left text-sm text-gray-600 bg-transparent border-none outline-none"
          >
            {value || placeholder}
          </button>
        )}

        {/* Clear Button */}
        {value && onClear && (
          <button
            onClick={onClear}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Search Button */}
        {withSearch && (
          <button
            onClick={onSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-primary text-white rounded-full hover:bg-primary/90 transition-colors"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </div>
      {/* Children (dropdown content) */}
      {children}
    </div>
  );
};

export default AppSearchOptionButton;
