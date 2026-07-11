import Image from "next/image";
import Link from "next/link";
import { cdn } from "@/lib/cdn";
import { Button } from "@/components/ui/button";

interface TransportHostBannerProps {
  lang: string;
  title: string;
  cta: string;
}

/**
 * "Own a transport office?" — the Airbnb Ask/host banner pattern
 * (`site/ask.tsx`): full-bleed rounded-2xl photo, big white headline,
 * single white pill button. Replaces the old two-column SaaS hero.
 */
export function TransportHostBanner({ lang, title, cta }: TransportHostBannerProps) {
  return (
    <div className="relative w-full h-96 overflow-hidden rounded-2xl">
      <div className="absolute inset-0">
        <Image
          src={cdn.product("assets/julia.jpg")}
          alt={title}
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="relative z-10 flex flex-col justify-center h-full px-8 sm:px-12 lg:px-16">
        <div className="max-w-2xl">
          <h2 className="text-white text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-8">
            {title}
          </h2>
          <Button
            asChild
            size="lg"
            className="bg-white text-gray-800 hover:bg-gray-100 text-base sm:text-lg px-8 py-6 rounded-lg font-semibold transition-colors duration-200 w-fit"
          >
            <Link href={`/${lang}/travel-host`}>{cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
