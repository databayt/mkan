"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useLocale } from "@/components/internationalization/use-locale";
import LocaleCurrencyDialog from "@/components/template/search/locale-currency-dialog";

const t = {
  en: { login: "Log in / Sign up", title: "Mkan" },
  ar: { login: "تسجيل الدخول / إنشاء حساب", title: "مكان" },
} as const;

interface PageHeaderProps {
  /** Replaces the default login link with custom right-side actions. */
  actions?: React.ReactNode;
  /** Hide the logo text label (icon only). */
  compact?: boolean;
}

export default function MenuPageHeader({ actions, compact }: PageHeaderProps) {
  const { locale } = useLocale();
  const { data: session } = useSession();
  const labels = t[locale] ?? t.en;

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6 md:px-12">
        <Link href={`/${locale}`} className="flex items-center gap-2" scroll={false}>
          <Image src="/tent.png" alt="Mkan" width={22} height={22} className="h-[22px] w-[22px]" />
          {!compact && (
            <span className="text-xl font-bold text-gray-900">
              Mk<span className="font-light text-gray-600">an</span>
            </span>
          )}
        </Link>

        <div className="flex items-center gap-3">
          {actions ?? (
            <>
              <LocaleCurrencyDialog />
              <Link
                href={session?.user ? `/${locale}` : `/${locale}/login`}
                className="rounded-full px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100"
              >
                {labels.login}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
