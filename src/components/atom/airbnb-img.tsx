"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Grip } from "lucide-react"
import { ShareIcon, HeartIcon } from "@/components/atom/icons"
import { useRouter } from "next/navigation"

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

  const handleShowAllPhotos = () => {
    if (listingId) {
      router.push(`/listings/${listingId}/photos`)
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
        <div 
          className="relative overflow-hidden rounded-l-xl lg:rounded-l-xl rounded-r-xl lg:rounded-r-none cursor-pointer"
          onClick={handleShowAllPhotos}
        >
          <Image
            src="/placeholder.svg?height=500&width=600"
            alt="Modern living room with gray sectional sofa and yellow accent chair"
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>

          {/* Grid of smaller images */}
          <div className="hidden lg:grid grid-cols-2 gap-2">
            {/* Top left */}
            <div className="relative overflow-hidden">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt="Dining area with wooden table and modern stairs"
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Top right */}
            <div className="relative overflow-hidden rounded-tr-xl">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt="Modern living room view"
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Bottom left */}
            <div className="relative overflow-hidden">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt="Modern kitchen with light colored cabinets"
                fill
                className="object-cover hover:scale-105 transition-transform duration-300"
              />
            </div>

            {/* Bottom right with overlay button */}
            <div className="relative overflow-hidden rounded-br-xl">
              <Image
                src="/placeholder.svg?height=250&width=300"
                alt="Exterior view of traditional European buildings"
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
              Show all photos
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
        <div className="relative overflow-hidden rounded-l-xl lg:rounded-l-xl rounded-r-xl lg:rounded-r-none cursor-pointer" onClick={handleShowAllPhotos}>
          <Image
            src={mainImage}
            alt="Property main image"
            fill
            className="object-cover hover:scale-105 transition-transform duration-300"
          />
        </div>

        {/* Grid of smaller images */}
        <div className="hidden lg:grid grid-cols-2 gap-2">
          {/* Top left */}
          <div className="relative overflow-hidden cursor-pointer" onClick={handleShowAllPhotos}>
            <Image
              src={thumbnailImages[0] || mainImage}
              alt="Property image 2"
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Top right */}
          <div className="relative overflow-hidden rounded-tr-xl cursor-pointer" onClick={handleShowAllPhotos}>
            <Image
              src={thumbnailImages[1] || mainImage}
              alt="Property image 3"
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Bottom left */}
          <div className="relative overflow-hidden cursor-pointer" onClick={handleShowAllPhotos}>
            <Image
              src={thumbnailImages[2] || mainImage}
              alt="Property image 4"
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          </div>

          {/* Bottom right with overlay button */}
          <div className="relative overflow-hidden rounded-br-xl cursor-pointer" onClick={handleShowAllPhotos}>
            <Image
              src={thumbnailImages[3] || mainImage}
              alt="Property image 5"
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />

            {/* Show all photos button */}
            <div className="absolute inset-0 bg-black/20 hover:bg-black/30 transition-colors duration-200" />
            <Button
              variant="secondary"
              size="sm"
              className="absolute bottom-4 right-4 gap-2 bg-[#ffffff] text-[#000000] hover:bg-gray-100 border border-gray-300"
            >
              <Grip className="w-4 h-4" />
              Show all photos
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
