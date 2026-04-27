import { Metadata } from "next";
import { RegisterForm } from "@/components/auth/join/form";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.join;
  return createMetadata({
    title: m.title,
    description: m.description,
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