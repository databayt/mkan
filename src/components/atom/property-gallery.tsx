"use client"

import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { useDictionary } from "@/components/internationalization/dictionary-context"

import { PropertyImageFallback } from "@/components/atom/property-image-fallback"

interface PropertyGalleryProps {
  images?: string[];
  onSave?: () => void;
  isSaved?: boolean;
  onShowAllPhotos?: () => void;
  className?: string;
  listingId?: string;
}

// Airbnb's "Show all photos" glyph — a 3×3 grid of dots, viewBox 0 0 16 16,
// r=1.5, fill currentColor (lifted from the live room page, node-measured).
function PhotosGridIcon() {
  const coords = [3, 8, 13];
  return (
    <svg
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", fill: "currentColor" }}
    >
      {coords.flatMap((cy) =>
        coords.map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} />),
      )}
    </svg>
  )
}

export default function PropertyGallery({
  images = [],
  onShowAllPhotos,
  className = "",
  listingId,
}: PropertyGalleryProps) {
  const router = useRouter()
  const params = useParams()
  const lang = (params?.lang as string) ?? "ar"
  const dict = useDictionary()
  const t = dict?.atom?.propertyGallery
  const imageAlt = (n: number) => (t?.imageAlt ?? "Property image {n}").replace("{n}", String(n))
  const viewPhotoN = (n: number) => (t?.viewPhotoN ?? "View property photo {n}").replace("{n}", String(n))

  const handleShowAllPhotos = () => {
    if (listingId) {
      router.push(`/${lang}/listings/${listingId}/photos`)
    } else if (onShowAllPhotos) {
      onShowAllPhotos()
    }
  }

  // No images → single rounded placeholder at the gallery's 2:1 footprint.
  if (!images || images.length === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="relative w-full aspect-[8/3] overflow-hidden rounded-[12px] border border-[#DDDDDD] bg-gray-100">
          <PropertyImageFallback className="object-contain p-6 bg-muted/40" />
        </div>
      </div>
    )
  }

  const mainImage = images[0] ?? "/placeholder.svg?height=560&width=560";
  const thumbnailImages = images.slice(1, 5);

  // The image button shared by every cell — square ratio comes from the grid.
  const cellBtn =
    "relative overflow-hidden cursor-pointer bg-muted after:absolute after:inset-0 after:bg-black/0 hover:after:bg-black/[0.06] after:transition-colors"

  return (
    <div className={`w-full ${className}`}>
      {/* Mobile/tablet: single image. lg+: exact Airbnb 50% + 2×2 grid, one 12px
          clip on the container rounds only the outer corners (8px gaps inside). */}
      <div className="relative aspect-[8/3] w-full overflow-hidden rounded-[12px] grid grid-cols-1 gap-2 lg:grid-cols-2">
        {/* Main large image — left half, full height */}
        <button
          type="button"
          className={cellBtn}
          onClick={handleShowAllPhotos}
          aria-label={t?.viewAllPhotos ?? "View all property photos"}
        >
          <Image
            src={mainImage}
            alt={t?.mainImageAlt ?? "Property main image"}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        </button>

        {/* Right half — 2×2 of the next four images */}
        <div className="hidden grid-cols-2 grid-rows-2 gap-2 lg:grid">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              type="button"
              className={cellBtn}
              onClick={handleShowAllPhotos}
              aria-label={i === 3 ? (t?.viewAllPhotos ?? "View all property photos") : viewPhotoN(i + 2)}
            >
              <Image
                src={thumbnailImages[i] || mainImage}
                alt={imageAlt(i + 2)}
                fill
                sizes="25vw"
                className="object-cover"
              />
              {/* "Show all photos" pill — only on the bottom-right cell */}
              {i === 3 && (
                <span className="pointer-events-none absolute bottom-[24px] end-[24px] z-10 inline-flex items-center gap-[4px] rounded-[8px] bg-[#F2F2F2] px-[16px] py-[8px] text-[12px] font-medium leading-4 text-[#222222] shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
                  <PhotosGridIcon />
                  {t?.showAllPhotos ?? "Show all photos"}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
