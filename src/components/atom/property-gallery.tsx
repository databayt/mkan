"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Grip } from "lucide-react"
import { ShareIcon, HeartIcon } from "@/components/atom/icons"
import { useParams, useRouter } from "next/navigation"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface PropertyGalleryProps {
  images?: string[];
  onSave?: () => void;
  isSaved?: boolean;
  onShowAllPhotos?: () => void;
  className?: string;
  listingId?: string;
}

export default function PropertyGallery({
  images = [],
  onSave,
  isSaved = false,
  onShowAllPhotos,
  className = "",
  listingId
}: PropertyGalleryProps) {
  const router = useRouter()
  const params = useParams()
  const lang = (params?.lang as string) ?? "ar"
  const dict = useDictionary()
  const t = dict?.atom?.propertyGallery
  const placeholderAlts = t?.placeholderAlts
  const imageAlt = (n: number) => (t?.imageAlt ?? "Property image {n}").replace("{n}", String(n))
  const viewPhotoN = (n: number) => (t?.viewPhotoN ?? "View property photo {n}").replace("{n}", String(n))

  const handleShowAllPhotos = () => {
    if (listingId) {
      router.push(`/${lang}/listings/${listingId}/photos`)
    } else if (onShowAllPhotos) {
      onShowAllPhotos()
    }
  }
  // If no images provided, show placeholder
  if (!images || images.length === 0) {
    return (
      <div className={`w-full ${className}`}>
        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-2 h-[200px] lg:h-[320px]">
                  {/* Main large image */}
        <button
          type="button"
          className="relative overflow-hidden rounded-s-xl lg:rounded-s-xl rounded-e-xl lg:rounded-e-none cursor-pointer"
          onClick={handleShowAllPhotos}
          aria-label={t?.viewAllPhotos ?? "View all property photos"}
        >
          <Image
            src="/placeholder.svg?height=500&width=600"
            alt={placeholderAlts?.livingRoom ?? "Modern living room with gray sectional sofa and yellow accent chair"}
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
        </button>

          {/* Grid of smaller images */}
          <div className="hidden lg:grid grid-cols-2 gap-2">
            {/* Top left */}
            <div className="relative overflow-hidden">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt={placeholderAlts?.diningArea ?? "Dining area with wooden table and modern stairs"}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Top right */}
            <div className="relative overflow-hidden rounded-tr-xl">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt={placeholderAlts?.livingView ?? "Modern living room view"}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Bottom left */}
            <div className="relative overflow-hidden">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt={placeholderAlts?.kitchen ?? "Modern kitchen with light colored cabinets"}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Bottom right with overlay button */}
            <div className="relative overflow-hidden rounded-br-xl">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt={placeholderAlts?.exterior ?? "Exterior view of traditional European buildings"}
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />

                          {/* Show all photos button */}
            <div className="absolute inset-0 bg-black/20 hover:bg-black/30 transition-colors duration-200" />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleShowAllPhotos}
              className="absolute bottom-4 right-4 gap-2 bg-[#ffffff] text-[#000000] hover:bg-gray-100 border border-gray-300"
            >
              <Grip className="w-4 h-4" />
              {t?.showAllPhotos ?? "Show all photos"}
            </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const mainImage = images[0] ?? "/placeholder.svg?height=500&width=600";
  const thumbnailImages = images.slice(1, 5);
  const totalImages = images.length;

  return (
    <div className={`w-full ${className}`}>
      <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-2 h-[200px] lg:h-[320px]">
        {/* Main large image */}
        <button type="button" className="relative overflow-hidden rounded-s-xl lg:rounded-s-xl rounded-e-xl lg:rounded-e-none cursor-pointer" onClick={handleShowAllPhotos} aria-label={t?.viewAllPhotos ?? "View all property photos"}>
          <Image
            src={mainImage}
            alt={t?.mainImageAlt ?? "Property main image"}
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
        </button>

        {/* Grid of smaller images */}
        <div className="hidden lg:grid grid-cols-2 gap-2">
          {/* Top left */}
          <button type="button" className="relative overflow-hidden cursor-pointer" onClick={handleShowAllPhotos} aria-label={viewPhotoN(2)}>
            <Image
              src={thumbnailImages[0] || mainImage}
              alt={imageAlt(2)}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </button>

          {/* Top right */}
          <button type="button" className="relative overflow-hidden rounded-tr-xl cursor-pointer" onClick={handleShowAllPhotos} aria-label={viewPhotoN(3)}>
            <Image
              src={thumbnailImages[1] || mainImage}
              alt={imageAlt(3)}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </button>

          {/* Bottom left */}
          <button type="button" className="relative overflow-hidden cursor-pointer" onClick={handleShowAllPhotos} aria-label={viewPhotoN(4)}>
            <Image
              src={thumbnailImages[2] || mainImage}
              alt={imageAlt(4)}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </button>

          {/* Bottom right with overlay button */}
          <button type="button" className="relative overflow-hidden rounded-br-xl cursor-pointer" onClick={handleShowAllPhotos} aria-label={t?.viewAllPhotos ?? "View all property photos"}>
            <Image
              src={thumbnailImages[3] || mainImage}
              alt={imageAlt(5)}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />

            {/* Show all photos button */}
            <div className="absolute inset-0 bg-black/20 hover:bg-black/30 transition-colors duration-200" />
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 right-4 gap-2 bg-[#ffffff] text-[#000000] hover:bg-gray-100 border border-gray-300"
              tabIndex={-1}
            >
              <Grip className="w-4 h-4" />
              {t?.showAllPhotos ?? "Show all photos"}
            </Button>
          </button>
        </div>
      </div>
    </div>
  )
}
