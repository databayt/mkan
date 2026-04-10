"use client";

import { signIn } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";

const translations = {
  en: {
    continueWithFacebook: "Continue with Facebook",
    continueWithGoogle: "Continue with Google",
  },
  ar: {
    continueWithFacebook: "المتابعة مع فيسبوك",
    continueWithGoogle: "المتابعة مع جوجل",
  },
} as const;

export const Social = ({ callbackUrl }: { callbackUrl?: string }) => {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  const onClick = (provider: "google" | "facebook") => {
    signIn(provider, {
      callbackUrl: callbackUrl || DEFAULT_LOGIN_REDIRECT,
    });
  }

  return (
    <div className="space-y-4 w-full">
      <Button
        variant="outline"
        className="w-full h-11 justify-start gap-3 text-base font-medium text-gray-900 border-gray-300 hover:border-gray-900 rounded-lg"
        onClick={() => onClick("facebook")}
      >
        <FacebookIcon />
        {t.continueWithFacebook}
      </Button>

      <Button
        variant="outline"
        className="w-full h-11 justify-start gap-3 text-base font-medium text-gray-900 border-gray-300 hover:border-gray-900 rounded-lg"
        onClick={() => onClick("google")}
      >
        <GoogleIcon />
        {t.continueWithGoogle}
      </Button>
    </div>
  );
};

// Social Media Icons Components
function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M20 10C20 4.477 15.523 0 10 0S0 4.477 0 10c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V10h2.54V7.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V10h2.773l-.443 2.89h-2.33v6.988C16.343 19.128 20 14.991 20 10z"
        fill="#1877F2"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M19.8055 8.0415H19V8H10V12H15.4515C14.527 14.3285 12.4115 16 10 16C6.686 16 4 13.314 4 10C4 6.686 6.686 4 10 4C11.5115 4 12.895 4.577 13.9805 5.5195L16.809 2.691C15.023 1.0265 12.634 0 10 0C4.4775 0 0 4.4775 0 10C0 15.5225 4.4775 20 10 20C15.5225 20 20 15.5225 20 10C20 9.3295 19.931 8.675 19.8055 8.0415Z"
        fill="#FFC107"
      />
      <path
        d="M1.1535 5.3455L4.438 7.797C5.4235 5.554 7.481 4 10 4C11.5115 4 12.895 4.577 13.9805 5.5195L16.809 2.691C15.023 1.0265 12.634 0 10 0C6.159 0 2.828 2.1685 1.1535 5.3455Z"
        fill="#FF3D00"
      />
      <path
        d="M10 20C12.583 20 14.93 19.0115 16.7045 17.404L13.6085 14.785C12.5718 15.5742 11.3038 16.001 10 16C7.599 16 5.4905 14.3415 4.5585 12.027L1.0975 14.5670C2.7525 17.7785 6.1135 20 10 20Z"
        fill="#4CAF50"
      />
      <path
        d="M19.8055 8.0415H19V8H10V12H15.4515C15.011 13.0115 14.308 13.8685 13.6085 14.785L16.7045 17.404C16.4855 17.6025 20 14.5 20 10C20 9.3295 19.931 8.675 19.8055 8.0415Z"
        fill="#1976D2"
      />
    </svg>
  )
}
