"use client";

import { useEffect } from "react";

/** Opens a closed <details> when the URL's #hash points inside it ("Record money received" → #record). */
export function OpenOnHash({ detailsId, hashes }: { detailsId: string; hashes: string[] }) {
  useEffect(() => {
    const open = () => {
      if (!hashes.includes(window.location.hash)) return;
      const d = document.getElementById(detailsId) as HTMLDetailsElement | null;
      if (d && !d.open) d.open = true;
      document.querySelector(window.location.hash)?.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [detailsId, hashes]);
  return null;
}
