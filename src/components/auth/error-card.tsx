"use client";

import { TriangleAlert } from "lucide-react";
import { usePathname } from "next/navigation";

import { CardWrapper } from "@/components/auth/card-wrapper";

const translations = {
  en: {
    headerLabel: "Authentication Error",
    backButtonLabel: "Back to login",
    errorCode: "Error code:",
    contactSupport: "If this problem persists, please contact support.",
    errors: {
      Configuration: "There is a problem with the server configuration.",
      AccessDenied: "You do not have permission to sign in.",
      Verification: "The verification link may have expired or already been used.",
      OAuthSignin: "Could not initiate sign in with OAuth provider.",
      OAuthCallback: "Error completing OAuth sign in.",
      OAuthCreateAccount: "Could not create OAuth user in database.",
      EmailCreateAccount: "Could not create email user in database.",
      Callback: "Something went wrong with the authentication callback.",
      OAuthAccountNotLinked: "This email is already associated with another account.",
      EmailSignin: "The email could not be sent.",
      CredentialsSignin: "The credentials you provided are invalid.",
      SessionRequired: "You must be signed in to access this page.",
      default: "An unexpected error occurred.",
    },
  },
  ar: {
    headerLabel: "خطأ في المصادقة",
    backButtonLabel: "العودة لتسجيل الدخول",
    errorCode: "رمز الخطأ:",
    contactSupport: "إذا استمرت هذه المشكلة، يرجى التواصل مع الدعم.",
    errors: {
      Configuration: "توجد مشكلة في إعدادات الخادم.",
      AccessDenied: "ليس لديك صلاحية لتسجيل الدخول.",
      Verification: "قد يكون رابط التحقق منتهي الصلاحية أو مستخدم بالفعل.",
      OAuthSignin: "تعذر بدء تسجيل الدخول عبر مزود OAuth.",
      OAuthCallback: "خطأ في إكمال تسجيل الدخول عبر OAuth.",
      OAuthCreateAccount: "تعذر إنشاء مستخدم OAuth في قاعدة البيانات.",
      EmailCreateAccount: "تعذر إنشاء مستخدم البريد الإلكتروني في قاعدة البيانات.",
      Callback: "حدث خطأ ما في عملية المصادقة.",
      OAuthAccountNotLinked: "هذا البريد الإلكتروني مرتبط بحساب آخر بالفعل.",
      EmailSignin: "تعذر إرسال البريد الإلكتروني.",
      CredentialsSignin: "بيانات الاعتماد المقدمة غير صالحة.",
      SessionRequired: "يجب تسجيل الدخول للوصول إلى هذه الصفحة.",
      default: "حدث خطأ غير متوقع.",
    },
  },
} as const;

interface ErrorCardProps {
  error?: string;
}

export const ErrorCard = ({ error }: ErrorCardProps) => {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  const errorMessage = error && error in t.errors
    ? t.errors[error as keyof typeof t.errors]
    : t.errors.default;

  return (
    <CardWrapper
      headerLabel={t.headerLabel}
      backButtonHref="/login"
      backButtonLabel={t.backButtonLabel}
    >
      <div className="w-full flex flex-col items-center gap-4">
        <div className="bg-destructive/15 p-3 rounded-md flex items-center gap-x-2 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
        {error && (
          <div className="text-xs text-muted-foreground text-center">
            <p>{t.errorCode} {error}</p>
            <p className="mt-2">{t.contactSupport}</p>
          </div>
        )}
      </div>
    </CardWrapper>
  );
};
