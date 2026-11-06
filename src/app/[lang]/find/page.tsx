import type { Metadata } from "next";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { createMetadata } from "@/lib/metadata";
import { getAgentTask } from "@/components/agent/actions";
import { AgentContent } from "@/components/agent/content";
import { verifyChatSig } from "@/components/agent/chat-link";
import { SharedChat } from "@/components/agent/shared-chat";
import { loadSharedTask } from "@/components/agent/task-view";

// Per-visitor: `?c=<id>` opens one of this browser's (or account's) chats; a
// bare /find is a new chat, as on ChatGPT. No site header or footer: the
// conversation owns the screen and carries its own bar (☰ chats, new chat).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.agent?.metaTitle ?? "Find a home in Kigali",
    description: d.agent?.metaDescription,
    locale: lang,
    path: "/find",
  });
}

export default async function FindPage({ params, searchParams }: { params: Promise<{ lang: Locale }>; searchParams: Promise<{ c?: string | string[]; s?: string | string[] }> }) {
  const [{ lang }, { c, s }] = await Promise.all([params, searchParams]);
  const id = typeof c === "string" && c ? c : null;
  const task = id ? await getAgentTask(id).catch(() => null) : null;
  // Not this browser's chat, but a signed link from WhatsApp (chat-link.ts): that chat's homes, read-only.
  if (!task && id && typeof s === "string" && verifyChatSig(id, s)) {
    const shared = await loadSharedTask(id).catch(() => null);
    if (shared) {
      return (
        <main id="main-content">
          <SharedChat task={shared} lang={lang} />
        </main>
      );
    }
  }
  return (
    <main id="main-content">
      <AgentContent initialTask={task} />
    </main>
  );
}
