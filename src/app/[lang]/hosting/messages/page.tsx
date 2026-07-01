import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { getConversations } from "@/lib/actions/message-actions";
import MessagesInbox from "@/components/hosting/messages/messages-inbox";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.hosting?.messages?.title ?? "Messages",
    description: "Your host inbox",
    locale: lang,
    path: "/hosting/messages",
  });
}

export default async function MessagesIndexPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${lang}/login`);

  const conversations = await getConversations();
  const dict = await getDictionary(lang as Locale);

  return (
    <MessagesInbox
      conversations={conversations}
      selected={null}
      lang={lang as Locale}
      dict={dict?.hosting?.messages ?? null}
    />
  );
}
