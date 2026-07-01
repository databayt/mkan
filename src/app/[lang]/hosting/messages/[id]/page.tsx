import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { getConversations, getConversation } from "@/lib/actions/message-actions";
import MessagesInbox from "@/components/hosting/messages/messages-inbox";

export const dynamic = "force-dynamic";

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${lang}/login`);

  const [conversations, selected, dict] = await Promise.all([
    getConversations(),
    getConversation(id),
    getDictionary(lang as Locale),
  ]);

  return (
    <MessagesInbox
      conversations={conversations}
      selected={selected}
      lang={lang as Locale}
      dict={dict?.hosting?.messages ?? null}
    />
  );
}
