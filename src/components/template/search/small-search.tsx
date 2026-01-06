"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

// Spring configuration for natural, Airbnb-like feel
const SPRING_CONFIG = {
  scale: { type: "spring" as const, stiffness: 300, damping: 25 },
};

interface SmallSearchProps {
  onExpand?: () => void;
  searchValues?: {
    location?: string;
    dates?: string;
    guests?: string;
  };
}

export default function SmallSearch({
  onExpand,
  searchValues,
}: SmallSearchProps) {
  const handleClick = () => {
    onExpand?.();
  };

  return (
    <motion.div
      className="bg-white rounded-full shadow-lg border border-gray-200 flex items-center overflow-hidden cursor-pointer"
      whileHover={{ scale: 1.02, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
      whileTap={{ scale: 0.98 }}
      transition={SPRING_CONFIG.scale}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Open search"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <button
        className="flex-1 px-5 py-3 text-left hover:bg-gray-50/50 transition-colors rounded-l-full"
        aria-label="Search location"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-black text-xs whitespace-nowrap">
          {searchValues?.location || "Anywhere"}
        </div>
      </button>

      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      <button
        className="flex-1 px-5 py-3 text-left hover:bg-gray-50/50 transition-colors"
        aria-label="Select dates"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-black text-xs whitespace-nowrap">
          {searchValues?.dates || "Any week"}
        </div>
      </button>

      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      <button
        className="flex-1 px-5 py-3 text-left hover:bg-gray-50/50 transition-colors"
        aria-label="Add guests"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-gray-500 text-xs whitespace-nowrap">
          {searchValues?.guests || "Guests"}
        </div>
      </button>

      <div className="pr-2 pl-1">
        <Button
          size="icon"
          className="rounded-full bg-[#de3151] hover:bg-[#de3151]/90 text-white w-8 h-8"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
  );
}
