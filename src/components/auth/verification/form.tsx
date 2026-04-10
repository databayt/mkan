"use client";

import { useCallback, useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { FormSuccess } from "../form-success";
import { FormError } from "../error/form-error";
import { newVerification } from "./action";

const translations = {
  en: {
    heading: "Confirming your verification",
    missingToken: "Missing token!",
    somethingWentWrong: "Something went wrong!",
    backToLogin: "Back to login",
  },
  ar: {
    heading: "جاري تأكيد التحقق",
    missingToken: "الرمز مفقود!",
    somethingWentWrong: "حدث خطأ ما!",
    backToLogin: "العودة لتسجيل الدخول",
  },
} as const;

interface NewVerificationFormProps extends React.ComponentPropsWithoutRef<"div"> {
  token?: string;
}

export const NewVerificationForm = ({
  className,
  token,
  ...props
}: NewVerificationFormProps) => {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  const onSubmit = useCallback(() => {
    if (success || error) return;

    if (!token) {
      setError(t.missingToken);
      return;
    }

    newVerification(token)
      .then((data) => {
        setSuccess(data.success);
        setError(data.error);
      })
      .catch(() => {
        setError(t.somethingWentWrong);
      });
  }, [token, success, error, t.missingToken, t.somethingWentWrong]);

  useEffect(() => {
    if (token) {
      onSubmit();
    }
  }, [token, onSubmit]);

  return (
    <div className={cn("flex flex-col gap-6 min-w-[200px] md:min-w-[350px]", className)} {...props}>
      <Card className="border-none shadow-none">
        <CardHeader className="text-center">
          <h1 className="text-xl font-semibold">{t.heading}</h1>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            <div className="flex items-center w-full justify-center">
              {!success && !error && (
                <BeatLoader />
              )}
              <FormSuccess message={success} />
              {!success && (
                <FormError message={error} />
              )}
            </div>

            <div className="text-center text-sm">
              <Link href="/auth/login" className="hover:underline underline-offset-4">
                {t.backToLogin}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
