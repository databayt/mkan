"use client"

import { useState } from "react"
import Image from "next/image"
import NavThumbnails from "./nav-thumbnails"
import { PropertyImageFallback } from "@/components/atom/property-image-fallback"

interface PhotoSection {
  id: string
  label: string
  photos: string[]
}

interface PhotoTourProps {
  sections?: PhotoSection[]
}

// Mock data - replace with actual listing data
const mockSections: PhotoSection[] = [
  {
    id: "living-room",
    label: "Living room",
    photos: [
      "https://cdn.databayt.org/mkan/stock/photo-1586023492125-27b2c045efd7.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1556909114-f6e7ad7d3136.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1552321554-5fefe8c9ef14.jpg"
    ]
  },
  {
    id: "kitchen",
    label: "Full kitchen",
    photos: [
      "https://cdn.databayt.org/mkan/stock/photo-1556909114-f6e7ad7d3136.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1552321554-5fefe8c9ef14.jpg"
    ]
  },
  {
    id: "bedroom",
    label: "Bedroom",
    photos: [
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1556909114-f6e7ad7d3136.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1552321554-5fefe8c9ef14.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg"
    ]
  },
  {
    id: "bathroom",
    label: "Full bathroom",
    photos: [
      "https://cdn.databayt.org/mkan/stock/photo-1552321554-5fefe8c9ef14.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
      "https://cdn.databayt.org/mkan/stock/photo-1556909114-f6e7ad7d3136.jpg"
    ]
  }
]

export default function PhotoTour({ sections = mockSections }: PhotoTourProps) {
  const [selectedSection, setSelectedSection] = useState<string>(sections[0]?.id || "")

  const scrollToSection = (sectionId: string) => {
    setSelectedSection(sectionId)
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const hasPhotos = sections.some((section) => section.photos && section.photos.length > 0)

  if (!hasPhotos) {
    return (
      <div className="px-6 md:px-20 py-8 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="relative w-full max-w-2xl aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
          <PropertyImageFallback className="object-contain p-6 bg-muted/40" />
        </div>
      </div>
    )
  }

  return (
    <div className=" px-20">
      {/* Title */}
      <h3 className="text-2xl mb-8">Photo tour</h3>

             {/* Navigation Thumbnails */}
       <NavThumbnails
         sections={sections}
         onSectionClick={scrollToSection}
         selectedSection={selectedSection}
       />

             {/* Photo Sections */}
       <div className="space-y-8">
         {sections.map((section) => (
                       <div key={section.id} id={section.id} className="grid grid-cols-1 md:grid-cols-6 gap-8">
              {/* Label Column */}
              <div className="md:col-span-2">
                <div className="sticky top-24">
                  <h4 className="">
                    {section.label}
                  </h4>
                </div>
              </div>

              {/* Photos Column */}
              <div className="md:col-span-4 space-y-4">
               {section.photos.map((photo, index) => (
                 <div
                   key={index}
                   className="relative aspect-[4/3] overflow-hidden cursor-pointer group"
                 >
                   <Image
                     src={photo}
                     alt={`${section.label} photo ${index + 1}`}
                     fill
                     className="object-cover transition-transform duration-300 group-hover:scale-105"
                   />
                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
                 </div>
               ))}
             </div>
           </div>
         ))}
       </div>
    </div>
  )
}
