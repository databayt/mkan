"use client";

import {
  Camera,
  ChefHat,
  Hand,
  UtensilsCrossed,
  Dumbbell,
  Sparkles,
  Scissors,
  Flower2,
  Soup,
} from "lucide-react";

// Service categories shown when the Services tab's "Type of service" segment is
// open — a clone of airbnb.com/services. The live site renders these as a
// wrapping row of rounded "pill" chips (icon + label), NOT a bordered card grid.
// UI-only (mkan has no services backend); selecting one fills the segment label.
// Labels carry their own en/ar copy so no new dictionary keys are needed.
const SERVICES = [
  { id: "photography", icon: Camera, en: "Photography", ar: "تصوير" },
  { id: "chefs", icon: ChefHat, en: "Chefs", ar: "طهاة" },
  { id: "massage", icon: Hand, en: "Massage", ar: "تدليك" },
  { id: "prepared-meals", icon: Soup, en: "Prepared meals", ar: "وجبات جاهزة" },
  { id: "training", icon: Dumbbell, en: "Training", ar: "تدريب" },
  { id: "makeup", icon: Sparkles, en: "Makeup", ar: "مكياج" },
  { id: "hair", icon: Scissors, en: "Hair", ar: "تصفيف الشعر" },
  { id: "spa", icon: Flower2, en: "Spa treatments", ar: "علاجات سبا" },
  { id: "catering", icon: UtensilsCrossed, en: "Catering", ar: "تقديم الطعام" },
] as const;

interface ServiceTypeDropdownProps {
  selected?: string;
  onSelect: (label: string) => void;
  locale?: "en" | "ar";
}

export default function ServiceTypeDropdown({
  selected,
  onSelect,
  locale = "en",
}: ServiceTypeDropdownProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {SERVICES.map((s) => {
        const label = locale === "ar" ? s.ar : s.en;
        const Icon = s.icon;
        const isSel = selected === label;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(label)}
            // Border/background set inline — brand-new arbitrary color utilities
            // can silently fail under Turbopack's on-demand scan.
            style={{
              borderWidth: isSel ? 2 : 1,
              borderStyle: "solid",
              borderColor: isSel ? "#222222" : "#DDDDDD",
              backgroundColor: isSel ? "#F7F7F7" : "#FFFFFF",
            }}
            className="inline-flex items-center gap-2 rounded-full ps-4 pe-5 py-2.5 transition-colors hover:border-[#222222]"
          >
            <Icon className="h-4 w-4 shrink-0 text-[#222222]" strokeWidth={1.8} />
            <span className="text-sm font-medium text-[#222222] whitespace-nowrap">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
