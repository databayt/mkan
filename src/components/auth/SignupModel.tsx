// Stub component for unused row components
"use client";

import { usePathname } from "next/navigation";

const translations = {
  en: { signUp: "Sign up" },
  ar: { signUp: "إنشاء حساب" },
} as const;

export default function SignupModel() {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  return (
    <li className="hover:bg-slate-200 rounded-md p-2 cursor-pointer">
      {t.signUp}
    </li>
  );
}
