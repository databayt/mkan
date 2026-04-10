import Image from "next/image"
import { ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function Guides() {
  const guides = [
    {
      title: "Getting started on Mkan",
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop&crop=center",
    },
    {
      title: "Finding a stay that's right for you",
      image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop&crop=center",
    },
    {
      title: "AirCover for guests",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop&crop=center",
    },
    {
      title: "Setting up your Mkan account",
      image: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop&crop=center",
    },
  ]

  return (
    <div className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">Guides for getting started</h1>
        <button className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
          <span className="text-base font-medium">Browse all topics</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Grid of guide cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {guides.map((guide, index) => (
          <Card
            key={index}
            className="border-0 shadow-none"
          >
            <CardContent className="p-0">
              <div className="relative overflow-hidden rounded-xl">
                <Image
                  src={guide.image || "/placeholder.svg"}
                  alt={guide.title}
                  width={400}
                  height={300}
                  className="w-full h-64 object-cover"
                />
              </div>
              <div className="pt-4">
                <h3 className="text-lg font-medium text-gray-900 leading-tight">{guide.title}</h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
