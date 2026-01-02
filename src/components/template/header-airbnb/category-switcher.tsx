'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Bus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategorySwitcherProps {
  lang?: string;
}

const categories = [
  {
    id: 'homes',
    label: 'Homes',
    labelAr: 'المنازل',
    icon: Home,
    href: '/',
    patterns: ['/', '/listing', '/search'],
  },
  {
    id: 'transport',
    label: 'Transport',
    labelAr: 'النقل',
    icon: Bus,
    href: '/transport',
    patterns: ['/transport'],
  },
];

export function CategorySwitcher({ lang = 'en' }: CategorySwitcherProps) {
  const pathname = usePathname();

  // Remove locale prefix from pathname for matching
  const pathWithoutLocale = pathname.replace(/^\/(en|ar)/, '') || '/';

  const isActive = (patterns: string[]) => {
    return patterns.some((pattern) => {
      if (pattern === '/') {
        return pathWithoutLocale === '/' || pathWithoutLocale === '';
      }
      return pathWithoutLocale.startsWith(pattern);
    });
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-full">
      {categories.map((category) => {
        const active = isActive(category.patterns);
        const Icon = category.icon;
        const href = lang ? `/${lang}${category.href}` : category.href;
        const label = lang === 'ar' ? category.labelAr : category.label;

        return (
          <Link
            key={category.id}
            href={href}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default CategorySwitcher;
