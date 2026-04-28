"use client";

import Image from "next/image";

import { Superhost } from "@/components/atom/icons";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface HostedByHost {
  username: string | null;
  email?: string | null;
  image?: string | null;
}

interface HostedByProps {
  host?: HostedByHost | null;
  hostingMonths?: number;
  superhost?: boolean;
}

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop";

export default function HostedBy({ host, hostingMonths, superhost = false }: HostedByProps) {
  const dict = useDictionary();
  const t = dict.rental?.host as Record<string, string> | undefined;

  const displayName =
    host?.username ?? host?.email?.split("@")[0] ?? t?.hostFallback ?? "Host";
  const avatar = host?.image ?? FALLBACK_AVATAR;
  const headline = (t?.hostedBy ?? "Hosted by {name}").replace("{name}", displayName);

  return (
    <div className="flex items-center gap-4 py-8">
      <div className="relative">
        <div className="w-11 h-11 rounded-full overflow-hidden relative">
          <Image
            src={avatar}
            alt={displayName}
            width={44}
            height={44}
            className="w-full h-full object-cover"
          />
        </div>
        {superhost && (
          <div className="absolute -bottom-0.5 -end-[5px]">
            <Superhost className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <h5 className="text-lg font-semibold">{headline}</h5>
        {(superhost || typeof hostingMonths === "number") && (
          <p>
            {[
              superhost ? t?.superhost ?? "Superhost" : null,
              typeof hostingMonths === "number"
                ? `${hostingMonths} ${t?.monthsHosting ?? "months hosting"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
