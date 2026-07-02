import React from "react";
import { EditorProvider } from "@/components/hosting/listing/editor-context";
import { EditorShell } from "@/components/hosting/listing/editor-shell";
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
      <EditorShell sidebar={<ListingSidebar />}>{children}</EditorShell>
    </EditorProvider>
  );
}
