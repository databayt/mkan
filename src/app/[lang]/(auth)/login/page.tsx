import { Metadata } from "next";
import { LoginForm } from "@/components/auth/login/form";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.login;
  return createMetadata({
    title: m.title,
    description: m.description,
    locale: lang,
    path: "/login",
  });
}

interface LoginPageProps {
  searchParams?: Promise<{
    callbackUrl?: string;
    error?: string;
  }>;
}

const LoginPage = async ({ searchParams }: LoginPageProps) => {
  const resolvedSearchParams = await searchParams;
  return (
    <LoginForm
      callbackUrl={resolvedSearchParams?.callbackUrl}
      error={resolvedSearchParams?.error}
    />
  );
};

export default LoginPage;