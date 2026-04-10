"use client";

import * as z from "zod";
import { useForm } from "react-hook-form";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResetSchema } from "../validation";
import { reset } from "./action";
import { FormError } from "../error/form-error";
import { FormSuccess } from "../form-success";

const translations = {
  en: {
    heading: "Reset your password",
    email: "Email",
    resetPassword: "Reset password",
    backToLogin: "Back to login",
  },
  ar: {
    heading: "إعادة تعيين كلمة المرور",
    email: "البريد الإلكتروني",
    resetPassword: "إعادة تعيين كلمة المرور",
    backToLogin: "العودة لتسجيل الدخول",
  },
} as const;

export const ResetForm = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) => {
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof ResetSchema>>({
    resolver: zodResolver(ResetSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = (values: z.infer<typeof ResetSchema>) => {
    setError("");
    setSuccess("");

    startTransition(() => {
      reset(values)
        .then((data) => {
          setError(data?.error);
          setSuccess(data?.success);
        });
    });
  };

  return (
    <div className="w-full max-w-[420px] mx-auto px-6 py-8 space-y-4">
      {/* Welcome Text */}
      <h3 className="text-[22px] font-medium leading-tight tracking-wide">
        {t.heading}
      </h3>

      {/* Form Section */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          {/* Email Input */}
          <div className="relative w-full">
            <input
              {...form.register("email")}
              type="email"
                          disabled={isPending}
              className="w-full px-3 py-2.5 text-base bg-transparent outline-none border-b border-gray-300 focus:border focus:border-black focus:rounded-lg focus:z-10 relative"
                          placeholder={t.email}
                        />
          </div>
        </div>

                <FormError message={error} />
                <FormSuccess message={success} />

        {/* Continue Button */}
                <Button
                  disabled={isPending}
                  type="submit"
          className="w-full h-12 bg-[#FF385C] hover:bg-[#E31C5F] text-white font-medium text-base rounded-lg"
                >
                  {t.resetPassword}
                </Button>

        {/* Back to Login Link */}
        <div className="text-center">
          <Link href="/login" className="text-xs text-gray-500 hover:text-gray-900 underline cursor-pointer transition-colors">
                  {t.backToLogin}
                </Link>
              </div>
            </form>
    </div>
  );
};
