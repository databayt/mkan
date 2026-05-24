"use client";

import * as z from "zod";
import { useForm } from "react-hook-form";
import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { NewPasswordSchema } from "../validation";
import { newPassword } from "./action";
import { FormError } from "../error/form-error";
import { FormSuccess } from "../form-success";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface NewPasswordFormProps extends React.ComponentPropsWithoutRef<"div"> {
  token?: string;
}

export const NewPasswordForm = ({
  className,
  token,
  ...props
}: NewPasswordFormProps) => {
  const params = useParams();
  const lang = (params?.lang as string) ?? "ar";
  const dict = useDictionary();
  const t = dict?.auth?.passwordReset;
  const [error, setError] = useState<string | undefined>("");
  const [success, setSuccess] = useState<string | undefined>("");
  const [isPending, startTransition] = useTransition();

  const form = useForm<z.infer<typeof NewPasswordSchema>>({
    resolver: zodResolver(NewPasswordSchema),
    defaultValues: {
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof NewPasswordSchema>) => {
    setError("");
    setSuccess("");

    startTransition(() => {
      newPassword(values, token)
        .then((data) => {
          setError(data?.error);
          setSuccess(data?.success);
        });
    });
  };

  return (
    <div className={cn("flex flex-col gap-6 min-w-[200px] md:min-w-[350px]", className)} {...props}>
      <Card className="border-none shadow-none">
        <CardHeader className="text-center">
          <h1 className="text-xl font-semibold">{t?.heading ?? "Enter a new password"}</h1>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6">
              <div className="grid gap-6">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="grid gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          disabled={isPending}
                          placeholder={t?.newPassword ?? "New Password"}
                          type="password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormError message={error} />
                <FormSuccess message={success} />

                <Button
                  disabled={isPending}
                  type="submit"
                  className="w-full h-11 text-base"
                >
                  {dict?.auth?.resetPassword ?? "Reset password"}
                </Button>
              </div>

              <div className="text-center text-sm">
                <Link href={`/${lang}/login`} className="hover:underline underline-offset-4">
                  {dict?.auth?.backToLogin ?? "Back to login"}
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};
