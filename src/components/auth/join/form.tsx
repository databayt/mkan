"use client";

import * as z from "zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RegisterSchema } from "../validation";
import { register } from "./action";
import { FormError } from "../error/form-error";
import { FormSuccess } from "../form-success";
import { Social } from "../social";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface RegisterFormProps extends React.ComponentPropsWithoutRef<"div"> {
  callbackUrl?: string;
}

export const RegisterForm = ({
  className,
  callbackUrl,
  ...props
}: RegisterFormProps) => {
  const dict = useDictionary();
  const auth = dict.auth ?? ({} as Record<string, any>);
  const t = {
    welcome: auth.welcome ?? "Welcome to Mkan",
    name: auth.name ?? "Name",
    namePlaceholder: auth.namePlaceholder ?? "Full name",
    email: auth.email ?? "Email",
    password: auth.password ?? "Password",
    continue: auth.continueButton ?? "Continue",
    or: auth.or ?? "or",
    alreadyHaveAccount: auth.alreadyHaveAccount ?? "Already have an account?",
  };
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof RegisterSchema>>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof RegisterSchema>) => {
    setError("");
    setSuccess("");

    startTransition(() => {
      register(values)
        .then((data) => {
          setError(data.error);
          setSuccess(data.success);
        });
    });
  };

  return (
    <div className="w-full max-w-[420px] mx-auto px-6 py-8 space-y-4">
      {/* Welcome Text */}
      <h3 className="text-[22px] font-medium leading-tight tracking-wide">
        {t.welcome}
      </h3>

      {/* Form Section */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="border border-gray-300 rounded-lg overflow-hidden">
          {/* Name Input */}
          <div className="relative w-full">
            <input
              {...form.register("name")}
              type="text"
              autoComplete="name"
              disabled={isPending}
              aria-label={t.name}
              className="w-full px-3 py-2.5 text-base bg-transparent outline-none border-b border-gray-300 focus:border focus:border-black focus:rounded-lg focus:z-10 relative"
              placeholder={t.namePlaceholder}
            />
          </div>

          {/* Email Input */}
          <div className="relative w-full">
            <input
              {...form.register("email")}
              type="email"
              autoComplete="email"
              disabled={isPending}
              aria-label={t.email}
              className="w-full px-3 py-2.5 text-base bg-transparent outline-none border-b border-gray-300 focus:border focus:border-black focus:rounded-lg focus:z-10 relative"
              placeholder={t.email}
            />
          </div>

          {/* Password Input */}
          <div className="relative w-full group">
            <input
              {...form.register("password")}
              type="password"
              autoComplete="new-password"
              disabled={isPending}
              aria-label={t.password}
              className="w-full px-3 py-2.5 text-base bg-transparent outline-none focus:border focus:border-black focus:rounded-lg focus:z-10 relative"
              placeholder={t.password}
            />
          </div>
        </div>

        {/* Show validation errors so silent "Invalid fields!" no longer happens */}
        {form.formState.errors.name && (
          <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
        )}
        {form.formState.errors.email && (
          <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
        )}
        {form.formState.errors.password && (
          <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
        )}

        <FormError message={error} />
        <FormSuccess message={success} />

        {/* Continue Button */}
        <Button
          disabled={isPending}
          type="submit"
          className="w-full h-12 bg-[#FF385C] hover:bg-[#E31C5F] text-white font-medium text-base rounded-lg"
        >
          {t.continue}
        </Button>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="text-sm text-gray-900 font-normal tracking-wider">{t.or}</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        {/* Social Login */}
        <Social callbackUrl={callbackUrl} />

        {/* Login Link */}
        <div className="text-center">
          <Link href="/login" className="text-xs text-gray-500 hover:text-gray-900 underline cursor-pointer transition-colors">
            {t.alreadyHaveAccount}
          </Link>
        </div>
      </form>
    </div>
  );
};
