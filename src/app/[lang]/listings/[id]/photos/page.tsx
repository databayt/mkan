"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ShareIcon, HeartIcon } from "@/components/atom/icons"
import { useRouter, useParams } from "next/navigation"
import PhotoTour from "@/components/listings/photo-tour"

export default function PhotoTourPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const [isSaved, setIsSaved] = useState(false)

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
              <span className="ml-1 underline">Share</span>
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
              <span className="ml-1 underline">Save</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Photo Tour Content */}
      <div className="pt-4">
        <PhotoTour />
      </div>
    </div>
  )
} 