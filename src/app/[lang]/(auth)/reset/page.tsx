import { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset/form";
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
    title: dict?.pages?.reset?.metadata?.title ?? "Reset Password",
    description:
      dict?.pages?.reset?.metadata?.description ?? "Reset your password",
    locale: lang,
    path: "/reset",
  });
}

const ResetPage = () => {
  return ( 
    <ResetForm />
  );
}
 
export default ResetPage;