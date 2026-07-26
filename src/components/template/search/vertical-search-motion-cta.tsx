"use client";

import { motion } from "framer-motion";
import { Search } from "lucide-react";

// The sheet CTA is a Framer shared-layout twin of the collapsed pill's red
// search circle (layoutId morph, choreographed by the mobile listings/search
// header sheets). It lives in its own chunk so vertical-search — which also
// renders the home hero, where no morph ever happens — doesn't drag the
// framer-motion engine into the home page's initial JS. On the sheet routes
// the engine is already loaded by the header, so this chunk resolves
// instantly there.
export default function MotionSearchCta({
  layoutId,
  onClick,
  label,
  isAr,
}: {
  layoutId: string;
  onClick: () => void;
  label: string;
  isAr: boolean;
}) {
  return (
    <motion.button
      layoutId={layoutId}
      type="button"
      onClick={onClick}
      className={`absolute bottom-5 end-6 z-30 flex h-12 items-center gap-2 rounded-sm ${isAr ? "px-6" : "px-4"} text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_2px_8px_rgba(222,49,81,0.25)]`}
    >
      <Search className="h-4 w-4" strokeWidth={2.5} />
      {label}
    </motion.button>
  );
}
