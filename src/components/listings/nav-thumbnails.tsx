"use client"

import { useState } from "react"
import Image from "next/image"

interface PhotoSection {
  id: string
  label: string
  photos: string[]
}

interface NavThumbnailsProps {
  sections: PhotoSection[]
  onSectionClick: (sectionId: string) => void
  selectedSection: string
}

export default function NavThumbnails({ 
  sections, 
  onSectionClick, 
  selectedSection 
}: NavThumbnailsProps) {
  return (
    <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
      {sections.map((section) => (
        <div
          key={section.id}
          className="flex-shrink-0 cursor-pointer"
          onClick={() => onSectionClick(section.id)}
        >
          <div className="relative w-30 h-20 overflow-hidden shadow-md">
            <Image
              src={section.photos[0] ?? '/placeholder.svg?height=80&width=120'}
              alt={section.label}
              fill
              className={`object-cover transition-all duration-200 ${
                selectedSection === section.id
                  ? 'ring-2 ring-black'
                  : 'hover:opacity-80'
              }`}
            />
          </div>
          <span className="mt-2 text-sm">
            {section.label}
          </span>
        </div>
      ))}
    </div>
  )
}
