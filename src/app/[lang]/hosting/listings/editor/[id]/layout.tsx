import React from "react";
import { EditorProvider } from "@/components/hosting/listing/editor-context";
import ListingSidebar from "@/components/hosting/listing/listing-sidebar";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string; lang: string }>;
}

export default async function EditorLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const listingId = Number(id);

  return (
    <EditorProvider listingId={listingId}>
      <div className="mx-auto max-w-7xl py-4">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          <aside className="w-full lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[22rem] lg:shrink-0 lg:overflow-y-auto lg:pe-1">
            <ListingSidebar />
          </aside>
          <main className="min-w-0 flex-1 lg:pt-2">{children}</main>
        </div>
      </div>
    </EditorProvider>
  );
}
