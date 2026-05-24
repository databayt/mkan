import { Metadata } from "next";
import { RegisterForm } from "@/components/auth/join/form";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.pages?.join?.metadata?.title ?? "Join",
    description:
      dict?.pages?.join?.metadata?.description ?? "Create your new account",
    locale: lang,
    path: "/join",
  });
}

interface RegisterPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
}

const RegisterPage = async ({ searchParams }: RegisterPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <RegisterForm callbackUrl={resolvedSearchParams?.callbackUrl} />
  );
};

export default RegisterPage;