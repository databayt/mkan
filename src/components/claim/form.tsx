"use client";

import * as z from "zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { FormError } from "@/components/auth/error/form-error";
import { FormSuccess } from "@/components/auth/form-success";
import type { Lang } from "@/components/translation/types";
import { ClaimSchema } from "./validation";
import { claimAccount } from "./action";

const COPY = {
  ar: {
    confirm: "نعم، هذه إعلاناتي وأنا صاحبها",
    password: "كلمة السر الجديدة",
    submit: "خُد الحساب",
    pending: "لحظة…",
    note: "بتقدر تعدّل الأسعار والصور والنصوص بعد الدخول، وما بننشر أي إعلان قبل ما توافق.",
  },
  en: {
    confirm: "Yes, these are my listings and I own them",
    password: "Choose a password",
    submit: "Claim the account",
    pending: "One moment…",
    note: "You can edit prices, photos and text once you're in, and nothing is published until you approve it.",
  },
} as const;

export function ClaimForm({ token, lang }: { token: string; lang: Lang }) {
  const t = COPY[lang] ?? COPY.ar;
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof ClaimSchema>>({
    resolver: zodResolver(ClaimSchema),
    defaultValues: { password: "", confirmed: false as unknown as true },
  });

  const onSubmit = (values: z.infer<typeof ClaimSchema>) => {
    setError(undefined);
    setSuccess(undefined);
    startTransition(() => {
      claimAccount(values, token)
        .then((res) => {
          setError(res?.error);
          setSuccess(res?.success);
        })
        .catch(() => setError("Something went wrong."));
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="confirmed"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start gap-3 space-y-0">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isPending}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel className="text-sm font-normal">{t.confirm}</FormLabel>
                <FormMessage />
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.password}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormError message={error} />
        <FormSuccess message={success} />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? t.pending : t.submit}
        </Button>
        <p className="text-xs text-muted-foreground">{t.note}</p>
      </form>
    </Form>
  );
}
