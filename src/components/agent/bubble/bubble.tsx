"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

// The panel (and the agent hook behind it) loads on first open only.
const AgentPanel = dynamic(() => import("./panel"), { ssr: false });

/** Public browsing pages only — not /find itself, the broker page, dashboards or auth. */
const SHOW_ON = /^\/(search|listings|travel|help)(\/|$)/;

/**
 * The rental agent as a side panel: a round launcher at the end corner opens a
 * full-height panel that takes 40% of the screen and pushes the site into the
 * rest, like Claude in Chrome (full screen on phones). It is the same agent and
 * the same task as /find; the panel's expand button goes there.
 * Anything can open it with `window.dispatchEvent(new Event("open-agent"))`.
 *
 * Opening it from any other page lands the site on /listings, so the homes the
 * agent is narrowing down sit beside the chat (the panel then filters that
 * page as the requirements firm up). The launcher is the robot mark the
 * hogwarts chatbot uses, on a theme-coloured disc so it reads over the
 * photo heroes too (hogwarts samples a solid backdrop, which a photo isn't).
 */
export function AgentBubble() {
  const dict = useDictionary();
  const b = dict?.agent?.bubble;
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const show = () => {
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener("open-agent", show);
    return () => window.removeEventListener("open-agent", show);
  }, []);

  const lang = pathname.match(/^\/(en|ar|rw)(?=\/|$)/)?.[1] ?? "en";
  const path = pathname.replace(/^\/(en|ar|rw)(?=\/|$)/, "") || "/";
  const visible = path === "/" || SHOW_ON.test(path);

  // The open panel pushes the page aside (globals.css `data-agent-panel`).
  useEffect(() => {
    const root = document.documentElement;
    if (open && visible) root.dataset.agentPanel = "open";
    else delete root.dataset.agentPanel;
    return () => {
      delete root.dataset.agentPanel;
    };
  }, [open, visible]);

  if (!visible) return null;

  return (
    <>
      {mounted && <AgentPanel open={open} onClose={() => setOpen(false)} onWaiting={setWaiting} />}
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
          if (!path.startsWith("/listings")) router.push(`/${lang}/listings`);
        }}
        aria-label={open ? b?.close ?? "Close" : b?.open ?? "Ask the rental agent"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-6 end-6 z-50 flex size-12 items-center justify-center rounded-full bg-background p-2 shadow-lg ring-1 ring-border transition-transform hover:scale-105 motion-reduce:transition-none md:size-14",
          open && "hidden",
        )}
      >
        <Image src="/illustrations/robot-fill.png" alt="" width={56} height={56} unoptimized className="size-full object-contain dark:invert" />
        {waiting && !open && (
          <span className="absolute end-0.5 top-0.5 size-3.5 rounded-full border-2 border-background bg-amber-500" aria-hidden />
        )}
      </button>
    </>
  );
}
