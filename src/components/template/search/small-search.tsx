"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

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
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  const handleClick = () => {
    onExpand?.();
  };

  return (
    <div
      className="bg-white rounded-full shadow-lg border border-gray-200 flex items-center overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
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
        className="flex-1 px-5 py-3 text-start hover:bg-gray-50/50 transition-colors rounded-s-full"
        aria-label="Search location"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-black text-xs whitespace-nowrap">
          {searchValues?.location || (isAr ? "أي مكان" : "Anywhere")}
        </div>
      </button>

      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      <button
        className="flex-1 px-5 py-3 text-start hover:bg-gray-50/50 transition-colors"
        aria-label="Select dates"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-black text-xs whitespace-nowrap">
          {searchValues?.dates || (isAr ? "أي أسبوع" : "Any week")}
        </div>
      </button>

      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />

      <button
        className="flex-1 px-5 py-3 text-start hover:bg-gray-50/50 transition-colors"
        aria-label="Add guests"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        <div className="font-semibold text-gray-500 text-xs whitespace-nowrap">
          {searchValues?.guests || (isAr ? "الضيوف" : "Guests")}
        </div>
      </button>

      <div className="pe-2 ps-1">
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
    </div>
  );
}
