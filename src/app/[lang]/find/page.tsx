import type { Metadata } from "next";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { createMetadata } from "@/lib/metadata";
import { getAgentTask } from "@/components/agent/actions";
import { AgentContent } from "@/components/agent/content";

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

export default async function FindPage({ searchParams }: { searchParams: Promise<{ c?: string | string[] }> }) {
  const { c } = await searchParams;
  const task = typeof c === "string" && c ? await getAgentTask(c).catch(() => null) : null;
  return (
    <main id="main-content">
      <AgentContent initialTask={task} />
    </main>
  );
}
