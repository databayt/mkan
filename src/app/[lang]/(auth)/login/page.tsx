import { Metadata } from "next";
import { LoginForm } from "@/components/auth/login/form";
import { createMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "تسجيل الدخول" : "Login",
    description:
      lang === "ar"
        ? "سجل دخولك إلى حسابك"
        : "Sign in to your account",
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