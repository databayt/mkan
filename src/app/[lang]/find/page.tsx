import type { Metadata } from "next";
import type { Locale } from "@/components/internationalization/config";
import { getDictionary } from "@/components/internationalization/dictionaries";
import SiteHeader from "@/components/template/header/header";
import { createMetadata } from "@/lib/metadata";
import { getAgentTask } from "@/components/agent/actions";
import { AgentContent } from "@/components/agent/content";

// Per-visitor: the page resumes this browser's last search from its cookie.
// No footer: like the assistant apps, the conversation owns the page.
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

export default async function FindPage() {
  const task = await getAgentTask().catch(() => null);
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main id="main-content">
        <AgentContent initialTask={task} />
      </main>
    </div>
  );
}
