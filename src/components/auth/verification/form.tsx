"use client";

import { useCallback, useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";
import { useParams } from "next/navigation";
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
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface NewVerificationFormProps extends React.ComponentPropsWithoutRef<"div"> {
  token?: string;
}

export const NewVerificationForm = ({
  className,
  token,
  ...props
}: NewVerificationFormProps) => {
  const params = useParams();
  const lang = (params?.lang as string) ?? "ar";
  const dict = useDictionary();
  const t = dict?.auth?.verification;
  const missingToken = t?.missingToken ?? "Missing token!";
  const somethingWentWrong = dict?.auth?.somethingWentWrong ?? "Something went wrong!";
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  const onSubmit = useCallback(() => {
    if (success || error) return;

    if (!token) {
      setError(missingToken);
      return;
    }

    newVerification(token)
      .then((data) => {
        setSuccess(data.success);
        setError(data.error);
      })
      .catch(() => {
        setError(somethingWentWrong);
      });
  }, [token, success, error, missingToken, somethingWentWrong]);

  useEffect(() => {
    if (token) {
      onSubmit();
    }
  }, [token, onSubmit]);

  return (
    <div className={cn("flex flex-col gap-6 min-w-[200px] md:min-w-[350px]", className)} {...props}>
      <Card className="border-none shadow-none">
        <CardHeader className="text-center">
          <h1 className="text-xl font-semibold">{t?.heading ?? "Confirming your verification"}</h1>
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
              <Link href={`/${lang}/login`} className="hover:underline underline-offset-4">
                {dict?.auth?.backToLogin ?? "Back to login"}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
