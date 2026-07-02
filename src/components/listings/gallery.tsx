"use client"

import { useState, useRef, useEffect } from "react"
import Image from "next/image"

interface PhotoSection {
  id: string
  label: string
  photos: string[]
}

interface GalleryProps {
  sections?: PhotoSection[]
}

// Mock data - replace with actual listing data
const mockSections: PhotoSection[] = [
  {
    id: "living-room",
    label: "Living room",
    photos: [
      "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
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

export default function Gallery({ sections = mockSections }: GalleryProps) {
  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id || "")
  const sectionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({})

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const headerHeight = 80 // Approximate header height

      // Find which section is currently in view
      for (const section of sections) {
        const sectionElement = sectionRefs.current[section.id]
        if (sectionElement) {
          const rect = sectionElement.getBoundingClientRect()
          const sectionTop = rect.top + scrollTop
          const sectionBottom = sectionTop + rect.height

          if (scrollTop + headerHeight >= sectionTop && scrollTop + headerHeight < sectionBottom) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [sections])

  const scrollToSection = (sectionId: string) => {
    const sectionElement = sectionRefs.current[sectionId]
    if (sectionElement) {
      const headerHeight = 80
      const elementTop = sectionElement.offsetTop - headerHeight
      window.scrollTo({
        top: elementTop,
        behavior: 'smooth'
      })
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky Navigation */}
      <div className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="flex gap-8 px-4 py-3 overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`flex-shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeSection === section.id
                  ? 'bg-black text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Photo Sections */}
      <div className="px-4 py-6">
        {sections.map((section) => (
          <div
            key={section.id}
            ref={(el) => {
              sectionRefs.current[section.id] = el
            }}
            className="mb-12"
          >
            {/* Section Label */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {section.label}
              </h2>
            </div>

            {/* Photos Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {section.photos.map((photo, index) => (
                <div
                  key={index}
                  className="relative aspect-[4/3] overflow-hidden rounded-lg cursor-pointer group"
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
