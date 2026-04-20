'use client';
import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";

import { CardWrapper } from "@/components/auth/card-wrapper";

const translations = {
  en: {
    headerLabel: "Oops! Something went wrong!",
    backButtonLabel: "Back to login",
  },
  ar: {
    headerLabel: "عذرا! حدث خطأ ما!",
    backButtonLabel: "العودة لتسجيل الدخول",
  },
} as const;

export const ErrorCard = () => {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  return (
    <CardWrapper
      headerLabel={t.headerLabel}
      backButtonHref="/login"
      backButtonLabel={t.backButtonLabel}
    >
      <div className="w-full flex justify-center items-center">
      <TriangleAlert className="text-destructive" />
      </div>
    </CardWrapper>
  );
};
