"use client"
import { cdn } from "@/lib/cdn";

import Image from "next/image"
import { Heart, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface DetailCardProps {
  title?: string
  location?: string
  guests?: string
  beds?: string
  baths?: string
  amenities?: string
  rating?: string
  reviews?: string
  price?: string
  image?: string
  isFavorited?: boolean
}

export default function DetailCard({
  title = "",
  location = "",
  guests = "",
  beds = "",
  baths = "",
  amenities = "",
  rating = "",
  reviews = "",
  price = "",
  image = cdn.product("property-placeholder.svg"),
  isFavorited = false
}: DetailCardProps) {
  const dict = useDictionary()

  return (
    <div className="flex gap-6">
      {/* Property Image */}
      <div className="relative flex-shrink-0 w-[250px] h-[170px] overflow-hidden rounded-xl border border-gray-200">
        {image === cdn.product("property-placeholder.svg") || !image ? (
          <div className="absolute inset-0 bg-muted/40 flex items-center justify-center p-4">
            <Image
              src={cdn.product("property-placeholder.svg")}
              alt="No image available"
              fill
              unoptimized
              className="object-contain"
            />
          </div>
        ) : (
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
          />
        )}
      </div>

      {/* Property Details */}
      <div className="flex-1 flex flex-col justify-between h-[170px]">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex flex-col">
            <p className="text-xs font-normal text-gray-500">{location}</p>
            <h3 className="text-base font-medium text-gray-900">{title}</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 p-0"
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`h-4 w-4 ${isFavorited ? 'fill-pink-300 text-pink-500' : 'text-gray-700'}`} />
          </Button>
        </div>

        {/* Details */}
        <div className="flex flex-col">
          <p className="text-xs font-normal text-gray-500">{guests} · {dict.rental?.property?.card?.entireHome ?? "Entire Home"} · {beds} · {baths}</p>
          <p className="text-xs font-normal text-gray-500">{amenities}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-1">
            <span className="text-xs font-medium text-gray-700">{rating}</span>
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-normal text-gray-700">({reviews} {dict.rental?.property?.card?.reviews ?? "reviews"})</span>
          </div>
          
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-gray-700">{price}</span>
            <span className="text-xs font-normal text-gray-700">/{dict.rental?.property?.card?.night ?? "night"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
