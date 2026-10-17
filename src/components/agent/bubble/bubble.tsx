"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

// The panel (and the agent hook behind it) loads on first open only.
const AgentPanel = dynamic(() => import("./panel"), { ssr: false });

/** Public browsing pages only — not /find itself, the broker page, dashboards or auth. */
const SHOW_ON = /^\/(search|listings|travel|help)(\/|$)/;

/**
 * The rental agent as a floating chat, in the hogwarts chatbot's shape: a round
 * launcher at the end corner and a panel above it (full screen on phones). It is
 * the same agent and the same task as /find; the panel's expand button goes there.
 * Anything can open it with `window.dispatchEvent(new Event("open-agent"))`.
 */
export function AgentBubble() {
  const dict = useDictionary();
  const b = dict?.agent?.bubble;
  const pathname = usePathname() ?? "/";
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

  const path = pathname.replace(/^\/(en|ar|rw)(?=\/|$)/, "") || "/";
  if (path !== "/" && !SHOW_ON.test(path)) return null;

  return (
    <>
      {mounted && <AgentPanel open={open} onClose={() => setOpen(false)} onWaiting={setWaiting} />}
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen((o) => !o);
        }}
        aria-label={open ? b?.close ?? "Close" : b?.open ?? "Ask the rental agent"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-6 end-6 z-50 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 motion-reduce:transition-none",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="size-6" aria-hidden /> : <MessageCircle className="size-6" aria-hidden />}
        {waiting && !open && (
          <span className="absolute end-0.5 top-0.5 size-3.5 rounded-full border-2 border-background bg-amber-500" aria-hidden />
        )}
      </button>
    </>
  );
}
