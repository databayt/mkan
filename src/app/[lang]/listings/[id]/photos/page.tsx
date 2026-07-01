"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ShareIcon, HeartIcon } from "@/components/atom/icons"
import { useRouter, useParams } from "next/navigation"
import PhotoTour from "@/components/listings/photo-tour"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { getListing } from "@/lib/actions/listing-actions"
import { Loader2 } from "lucide-react"

export default function PhotoTourPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const dict = useDictionary()
  const [isSaved, setIsSaved] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const handleBack = () => {
    router.back()
  }

  const handleSave = () => {
    setIsSaved(!isSaved)
  }

  const handleShare = () => {
    // Implement share functionality
    if (navigator.share) {
      navigator.share({
        title: 'Property Photo Tour',
        url: window.location.href
      })
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
    }
  }

  useEffect(() => {
    if (!params?.id) return;
    const listingId = parseInt(params.id);
    if (isNaN(listingId)) {
      setLoading(false);
      return;
    }

    getListing(listingId)
      .then((listing) => {
        if (listing && listing.photoUrls) {
          setPhotos(listing.photoUrls);
        }
      })
      .catch((err) => {
        console.error("Error fetching listing photos:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params?.id]);

  const sections = [
    {
      id: "all-photos",
      label: (dict?.rental?.listing as any)?.allPhotos ?? "All photos",
      photos: photos
    }
  ];

  return (
    <div className="min-h-screen bg-white pb-10">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 bg-white">
        <div className="flex items-center justify-between p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className=" hover:bg-gray-200 rounded-full transition-colors"
          >
            <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Button>
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="p-2"
            >
              <ShareIcon className="w-5 h-5" />
              <span className="ms-1 underline">{dict.rental?.listing?.share}</span>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              className="p-2"
            >
              <HeartIcon 
                className={`w-5 h-5 ${isSaved ? 'fill-red-500 text-red-500' : ''}`} 
              />
              <span className="ms-1 underline">{dict.rental?.listing?.save}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Photo Tour Content */}
      <div className="pt-4">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : (
          <PhotoTour sections={sections} />
        )}
      </div>
    </div>
  )
} 