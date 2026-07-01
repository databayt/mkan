"use client";

import { useEffect, useState } from "react";

// Drives responsive layout switches from JS instead of Tailwind `sm:`/`lg:`
// variants. Brand-new responsive + arbitrary utilities (e.g. `sm:static`,
// `lg:w-[400px]`) silently fail to generate under Turbopack dev, so layout that
// MUST flip at a breakpoint reads the match here and applies it via inline
// style. Defaults to `true` (desktop) so the desktop layout never flashes the
// mobile variant before hydration.
export function useIsDesktop(minWidth = 1024): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [minWidth]);

  return isDesktop;
}
