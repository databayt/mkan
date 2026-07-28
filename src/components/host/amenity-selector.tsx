"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SelectionCard from "./selection-card";
import { cn } from "@/lib/utils";
import { Amenity } from "@prisma/client";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { cdn } from "@/lib/cdn";

interface AmenityOption {
  id: string;
  label: string;
  iconSrc: string;
  iconAlt: string;
}

interface AmenitySection {
  id: string;
  heading: string;
  items: AmenityOption[];
}

interface AmenitySelectorProps {
  selectedAmenities: string[];
  onToggle: (amenityId: string) => void;
  className?: string;
}

// Original Airbnb amenity icons (45×45, #3C3C3C) shipped in /public/amenities.
const SvgIcon = ({ src, alt, size = 28 }: { src: string; alt: string; size?: number }) => (
  <Image src={src} alt={alt} width={size} height={size} className="object-contain" />
);

// Map the picker's ids onto the Prisma `Amenity` enum.
//
// This table used to collapse 12 of these onto whatever value was nearest,
// because the enum had nowhere to put them: a host ticking "Carbon monoxide
// alarm" saved *Hardwood Floors*, ticking "TV" saved *High Speed Internet*,
// ticking "Kitchen" saved *Dishwasher*, and anything unrecognised fell through
// `|| Amenity.WiFi` and claimed wifi. Every one of those wrote a fact the host
// had not stated onto their own listing. The enum now covers the full picker,
// so each id maps to itself and nothing is invented.
//
// Returns null for an unknown id rather than guessing — see the caller, which
// drops nulls instead of persisting a wrong value.
const PICKER_TO_AMENITY: Record<string, Amenity> = {
  wifi: Amenity.WiFi,
  tv: Amenity.TV,
  kitchen: Amenity.Kitchen,
  washer: Amenity.WasherDryer,
  "free-parking": Amenity.Parking,
  "paid-parking": Amenity.Parking,
  "air-conditioning": Amenity.AirConditioning,
  "dedicated-workspace": Amenity.DedicatedWorkspace,
  pool: Amenity.Pool,
  "hot-tub": Amenity.HotTub,
  patio: Amenity.PatioOrBalcony,
  "bbq-grill": Amenity.BbqGrill,
  "outdoor-dining": Amenity.OutdoorDining,
  "fire-pit": Amenity.FirePit,
  "pool-table": Amenity.PoolTable,
  "indoor-fireplace": Amenity.IndoorFireplace,
  piano: Amenity.Piano,
  "exercise-equipment": Amenity.Gym,
  "lake-access": Amenity.LakeAccess,
  "beach-access": Amenity.BeachAccess,
  "outdoor-shower": Amenity.OutdoorShower,
  "smoke-alarm": Amenity.SmokeAlarm,
  "first-aid-kit": Amenity.FirstAidKit,
  "fire-extinguisher": Amenity.FireExtinguisher,
  "carbon-monoxide-alarm": Amenity.CarbonMonoxideAlarm,
};

export const mapAmenityToPrisma = (amenityId: string): Amenity | null =>
  PICKER_TO_AMENITY[amenityId] ?? null;

// Airbnb-style ease; matches the smooth glide used elsewhere in the app.
const SWITCH_TRANSITION = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
};

const AmenitySelector: React.FC<AmenitySelectorProps> = ({
  selectedAmenities,
  onToggle,
  className,
}) => {
  const dict = useDictionary();
  const { isRTL } = useLocale();
  const a = dict.hosting.pages.amenities;

  const sections: AmenitySection[] = useMemo(
    () => [
      {
        id: "guest-favorites",
        heading: a.guestFavorites,
        items: [
          { id: "wifi", label: a.wifi, iconSrc: cdn.vendor("airbnb", "wifi.svg"), iconAlt: "Wifi" },
          { id: "tv", label: a.tv, iconSrc: cdn.vendor("airbnb", "tv.svg"), iconAlt: "TV" },
          {
            id: "kitchen",
            label: a.kitchen,
            iconSrc: cdn.vendor("airbnb", "kitchen.svg"),
            iconAlt: "Kitchen",
          },
          {
            id: "washer",
            label: a.washer,
            iconSrc: cdn.vendor("airbnb", "washer.svg"),
            iconAlt: "Washer",
          },
          {
            id: "free-parking",
            label: a.freeParking,
            iconSrc: cdn.vendor("airbnb", "free-parking.svg"),
            iconAlt: "Free parking",
          },
          {
            id: "paid-parking",
            label: a.paidParking,
            iconSrc: cdn.vendor("airbnb", "paid-street-parking.svg"),
            iconAlt: "Paid parking",
          },
          {
            id: "air-conditioning",
            label: a.ac,
            iconSrc: cdn.vendor("airbnb", "air-conditioning.svg"),
            iconAlt: "Air conditioning",
          },
          {
            id: "dedicated-workspace",
            label: a.workspace,
            iconSrc: cdn.vendor("airbnb", "dedicated-workspace.svg"),
            iconAlt: "Workspace",
          },
        ],
      },
      {
        id: "standout",
        heading: a.standoutAmenities,
        items: [
          { id: "pool", label: a.pool, iconSrc: cdn.vendor("airbnb", "pool.svg"), iconAlt: "Pool" },
          {
            id: "hot-tub",
            label: a.hotTub,
            iconSrc: cdn.vendor("airbnb", "hot-tub.svg"),
            iconAlt: "Hot tub",
          },
          {
            id: "patio",
            label: a.patio,
            iconSrc: cdn.vendor("airbnb", "private-patio-or-balcony.svg"),
            iconAlt: "Patio",
          },
          {
            id: "bbq-grill",
            label: a.bbqGrill,
            iconSrc: cdn.vendor("airbnb", "bbq-grill.svg"),
            iconAlt: "BBQ grill",
          },
          {
            id: "outdoor-dining",
            label: a.outdoorDining,
            iconSrc: cdn.vendor("airbnb", "outdoor-dining.svg"),
            iconAlt: "Outdoor dining area",
          },
          {
            id: "fire-pit",
            label: a.firePit,
            iconSrc: cdn.vendor("airbnb", "fire-pit.svg"),
            iconAlt: "Fire pit",
          },
          {
            id: "pool-table",
            label: a.poolTable,
            iconSrc: cdn.vendor("airbnb", "pool-table.svg"),
            iconAlt: "Pool table",
          },
          {
            id: "indoor-fireplace",
            label: a.indoorFireplace,
            iconSrc: cdn.vendor("airbnb", "indoor-fireplace.svg"),
            iconAlt: "Indoor fireplace",
          },
          {
            id: "piano",
            label: a.piano,
            iconSrc: cdn.vendor("airbnb", "piano.svg"),
            iconAlt: "Piano",
          },
          {
            id: "exercise-equipment",
            label: a.exerciseEquipment,
            iconSrc: cdn.vendor("airbnb", "gym.svg"),
            iconAlt: "Exercise equipment",
          },
          {
            id: "lake-access",
            label: a.lakeAccess,
            iconSrc: cdn.vendor("airbnb", "waterfront.svg"),
            iconAlt: "Lake access",
          },
          {
            id: "beach-access",
            label: a.beachAccess,
            iconSrc: cdn.vendor("airbnb", "beachfront.svg"),
            iconAlt: "Beach access",
          },
          // Ski-in/ski-out is dropped rather than given an enum value: mkan
          // lists Sudan, where no property can truthfully offer it, so the
          // checkbox could only ever record something false.
          {
            id: "outdoor-shower",
            label: a.outdoorShower,
            iconSrc: cdn.vendor("airbnb", "outdoor-shower.svg"),
            iconAlt: "Outdoor shower",
          },
        ],
      },
      {
        id: "safety",
        heading: a.safetyItems,
        items: [
          {
            id: "smoke-alarm",
            label: a.smokeAlarm,
            iconSrc: cdn.vendor("airbnb", "smoke-alarm.svg"),
            iconAlt: "Smoke alarm",
          },
          {
            id: "first-aid-kit",
            label: a.firstAidKit,
            iconSrc: cdn.vendor("airbnb", "first-aid-kit.svg"),
            iconAlt: "First aid kit",
          },
          {
            id: "fire-extinguisher",
            label: a.fireExtinguisher,
            iconSrc: cdn.vendor("airbnb", "fire-extinguisher.svg"),
            iconAlt: "Fire extinguisher",
          },
          {
            id: "carbon-monoxide-alarm",
            label: a.carbonMonoxideAlarm,
            iconSrc: cdn.vendor("airbnb", "carbon-monoxide-alarm.svg"),
            iconAlt: "Carbon monoxide alarm",
          },
        ],
      },
    ],
    [a],
  );

  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = (next: number, dir: number) => {
    if (next < 0 || next > sections.length - 1) return;
    setDirection(dir);
    setActive(next);
  };

  const section = sections[active];
  if (!section) return null;

  const slide = isRTL ? -1 : 1;

  const variants = {
    enter: (dir: number) => ({ opacity: 0, x: dir * slide * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: dir * slide * -28 }),
  };

  const selectedInSection = section.items.filter((i) => selectedAmenities.includes(i.id)).length;

  const navButton =
    "flex h-9 w-9 items-center justify-center rounded-full border border-foreground/40 text-foreground transition " +
    "hover:border-foreground hover:bg-accent " +
    "disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-foreground/40 disabled:hover:bg-transparent";

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div
            key={section.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={SWITCH_TRANSITION}
          >
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h5 className="text-lg sm:text-xl font-semibold">{section.heading}</h5>
              {selectedInSection > 0 && (
                <span dir="ltr" className="shrink-0 text-xs text-muted-foreground">
                  {selectedInSection} / {section.items.length}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {section.items.map((amenity) => (
                <SelectionCard
                  key={amenity.id}
                  id={amenity.id}
                  title={amenity.label}
                  icon={<SvgIcon src={amenity.iconSrc} alt={amenity.iconAlt} />}
                  isSelected={selectedAmenities.includes(amenity.id)}
                  onClick={onToggle}
                  compact
                  className="p-2 sm:p-3"
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Tab navigation: progress dots at the start, flip arrows pinned to the end */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={s.heading}
              aria-current={i === active}
              onClick={() => goTo(i, i > active ? 1 : -1)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-200",
                i === active
                  ? "w-5 bg-foreground"
                  : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70",
              )}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={a?.prevSection ?? "Previous section"}
            disabled={active === 0}
            onClick={() => goTo(active - 1, -1)}
            className={navButton}
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          </button>
          <button
            type="button"
            aria-label={a?.nextSection ?? "Next section"}
            disabled={active === sections.length - 1}
            onClick={() => goTo(active + 1, 1)}
            className={navButton}
          >
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AmenitySelector;
