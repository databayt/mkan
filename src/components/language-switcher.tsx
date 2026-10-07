'use client';

import Link from 'next/link';
import { useSwitchLocaleHref, useLocale } from '@/components/internationalization/use-locale';
import { i18n, localeConfig, type Locale } from '@/components/internationalization/config';
import { useDictionary } from '@/components/internationalization/use-dictionary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "dropdown" | "inline" | "toggle" | "text";
}

// With 3+ locales "the other one" is ambiguous: cycle through i18n.locales.
function nextLocaleOf(current: Locale): Locale {
  const locales = i18n.locales as readonly Locale[];
  const idx = locales.indexOf(current);
  return locales[(idx + 1) % locales.length]!;
}

export function LanguageSwitcher({
  className,
  variant = "dropdown"
}: LanguageSwitcherProps) {
  const getSwitchLocaleHref = useSwitchLocaleHref();
  const { locale: currentLocale, isRTL } = useLocale();
  const dict = useDictionary();

  // Text variant - shows the next language's native name, clicks to cycle
  if (variant === "text") {
    const nextLocale = nextLocaleOf(currentLocale);
    const nextConfig = localeConfig[nextLocale];

    return (
      <Link
        href={getSwitchLocaleHref(nextLocale)}
        className={cn("transition-opacity hover:opacity-80", className)}
      >
        {nextConfig.nativeName}
      </Link>
    );
  }

  // Toggle variant - simple button that switches to the other language
  if (variant === "toggle") {
    // Cycle to the next locale in i18n.locales order
    const nextLocale = nextLocaleOf(currentLocale);

    return (
      <Button
        variant="link"
        size="icon"
        className={cn("h-8 w-8 px-0", className)}
        asChild
      >
        <Link href={getSwitchLocaleHref(nextLocale)}>
          <Languages className="h-4 w-4" />
          <span className="sr-only">{dict?.navigation?.switchLanguage ?? "Switch language"}</span>
        </Link>
      </Button>
    );
  }

  if (variant === "inline") {
    return (
      <div className={cn("flex gap-2", className)}>
        {i18n.locales.map((locale) => {
          const config = localeConfig[locale];
          const isActive = locale === currentLocale;

          return (
            <Link
              key={locale}
              href={getSwitchLocaleHref(locale)}
              className={cn(
                "px-3 py-1 rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              )}
            >
              <span className="text-lg me-2">{config.flag}</span>
              <span className="text-sm">{config.nativeName}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9", className)}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{dict?.navigation?.switchLanguage ?? "Switch language"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isRTL ? "start" : "end"}>
        {i18n.locales.map((locale) => {
          const config = localeConfig[locale];
          const isActive = locale === currentLocale;

          return (
            <DropdownMenuItem key={locale} asChild>
              <Link
                href={getSwitchLocaleHref(locale)}
                className={cn(
                  "flex items-center gap-2 w-full",
                  isActive && "bg-muted"
                )}
              >
                <span className="text-lg">{config.flag}</span>
                <span>{config.nativeName}</span>
                {isActive && (
                  <span className="ms-auto text-xs">✓</span>
                )}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}