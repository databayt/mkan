// Stub component for unused row components
"use client";

import { usePathname } from "next/navigation";

const translations = {
  en: { login: "Login" },
  ar: { login: "تسجيل الدخول" },
} as const;

export default function LoginModel() {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  return (
    <li className="hover:bg-slate-200 rounded-md p-2 cursor-pointer">
      {t.login}
    </li>
  );
}
