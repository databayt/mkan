"use client";

import { TriangleAlert } from "lucide-react";
import { useParams } from "next/navigation";

import { CardWrapper } from "@/components/auth/card-wrapper";
import { useDictionary } from "@/components/internationalization/dictionary-context";

const DEFAULT_ERRORS: Record<string, string> = {
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
};

interface ErrorCardProps {
  error?: string;
}

export const ErrorCard = ({ error }: ErrorCardProps) => {
  const params = useParams();
  const lang = (params?.lang as string) ?? "ar";
  const dict = useDictionary();
  const t = dict?.auth?.errorCard;
  const errors = (t?.errors ?? {}) as Record<string, string>;

  const errorMessage =
    (error && (errors[error] ?? DEFAULT_ERRORS[error])) ||
    errors.default ||
    DEFAULT_ERRORS.default;

  return (
    <CardWrapper
      headerLabel={t?.headerLabel ?? "Authentication Error"}
      backButtonHref={`/${lang}/login`}
      backButtonLabel={dict?.auth?.backToLogin ?? "Back to login"}
    >
      <div className="w-full flex flex-col items-center gap-4">
        <div className="bg-destructive/15 p-3 rounded-md flex items-center gap-x-2 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" />
          <p>{errorMessage}</p>
        </div>
        {error && (
          <div className="text-xs text-muted-foreground text-center">
            <p>{t?.errorCode ?? "Error code:"} {error}</p>
            <p className="mt-2">
              {t?.contactSupport ?? "If this problem persists, please contact support."}
            </p>
          </div>
        )}
      </div>
    </CardWrapper>
  );
};
