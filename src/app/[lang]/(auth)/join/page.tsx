import { Metadata } from "next";
import { RegisterForm } from "@/components/auth/join/form";
import { createMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "إنشاء حساب" : "Join",
    description:
      lang === "ar"
        ? "أنشئ حسابك الجديد"
        : "Create your new account",
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