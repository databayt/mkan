import { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset/form";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: Locale }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const m = (await getDictionary(lang)).pageMetadata.reset;
  return createMetadata({
    title: m.title,
    description: m.description,
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