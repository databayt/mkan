"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

// The panel (and the agent hook behind it) loads on first open, or earlier
// when the page is idle on a fast connection (`warmPanel`).
const AgentPanel = dynamic(() => import("./panel"), { ssr: false });
const loadPanel = () => import("./panel");

/** Fetch the panel's chunk ahead of the first open, unless the visitor saves data or is on a slow link. */
function warmPanel(): () => void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /(^|-)2g$|^3g$/.test(conn?.effectiveType ?? "")) return () => {};
  const warm = () => void loadPanel();
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(warm, { timeout: 5_000 });
    return () => window.cancelIdleCallback(id);
  }
  // Safari has no requestIdleCallback.
  const id = setTimeout(warm, 3_000);
  return () => clearTimeout(id);
}

/** Public browsing pages only — not /find itself, the broker page, dashboards or auth. */
const SHOW_ON = /^\/(search|listings|travel|help)(\/|$)/;

/**
 * The rental agent as a side panel: a round launcher at the end corner opens a
 * full-height panel that takes 40% of the screen and pushes the site into the
 * rest, like Claude in Chrome (full screen on phones). It is the same agent and
 * the same task as /find; the panel's expand button goes there.
 * Anything can open it with `window.dispatchEvent(new Event("open-agent"))`.
 *
 * The page behind the panel is left alone: the agent's homes are in the panel.
 * It used to send the site to /listings and re-filter that page as the chat
 * went on — a full page render and a grid of image resizes per change on the
 * one container, which the chat's own sends then queued behind (Next runs a
 * server action only after a navigation settles), and on phones the panel
 * covers the page anyway (2026-10-24). The launcher is the robot mark the
 * hogwarts chatbot uses, on a theme-coloured disc so it reads over the
 * photo heroes too (hogwarts samples a solid backdrop, which a photo isn't).
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
  const visible = path === "/" || SHOW_ON.test(path);
  // Stable, so the open panel does not re-bind its Escape listener on every render here.
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => (visible && !mounted ? warmPanel() : undefined), [visible, mounted]);

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
      {mounted && <AgentPanel open={open} onClose={close} onWaiting={setWaiting} />}
      <button
        type="button"
        onPointerDown={() => void loadPanel()}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        aria-label={open ? b?.close ?? "Close" : b?.open ?? "Ask the rental agent"}
        aria-expanded={open}
        className={cn(
          "fixed bottom-6 end-6 z-50 flex size-12 items-center justify-center rounded-full bg-background p-2 shadow-lg ring-1 ring-border transition-transform hover:scale-105 motion-reduce:transition-none md:size-14",
          open && "hidden",
        )}
      >
        {/* Through the optimiser: a 64/128 px WebP the edge keeps for a month, not the 512 px PNG on every page view. */}
        <Image src="/illustrations/robot-fill.png" alt="" width={56} height={56} sizes="56px" className="size-full object-contain dark:invert" />
        {waiting && !open && (
          <span className="absolute end-0.5 top-0.5 size-3.5 rounded-full border-2 border-background bg-amber-500" aria-hidden />
        )}
      </button>
    </>
  );
}
