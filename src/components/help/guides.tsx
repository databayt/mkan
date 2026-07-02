"use client";
import { cdn } from "@/lib/cdn";

import Image from "next/image"
import { ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function Guides() {
  const dict = useDictionary();
  const t = dict?.help?.guides;
  const items = t?.items;

  const guides = [
    {
      title: items?.gettingStarted ?? "Getting started on Mkan",
      image: "https://cdn.databayt.org/mkan/stock/photo-1566073771259-6a8506099945.jpg",
    },
    {
      title: items?.findingStay ?? "Finding a stay that's right for you",
      image: "https://cdn.databayt.org/mkan/stock/photo-1522708323590-d24dbb6b0267.jpg",
    },
    {
      title: items?.airCover ?? "AirCover for guests",
      image: "https://cdn.databayt.org/mkan/stock/photo-1558618666-fcd25c85cd64.jpg",
    },
    {
      title: items?.settingUpAccount ?? "Setting up your Mkan account",
      image: "https://cdn.databayt.org/mkan/stock/photo-1556742049-0cfed4f6a45d.jpg",
    },
  ]

  return (
    <div className="py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-semibold text-gray-900">{t?.title ?? "Guides for getting started"}</h1>
        <button className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors">
          <span className="text-base font-medium">{t?.browseAll ?? "Browse all topics"}</span>
          <ChevronRight className="w-4 h-4 rtl:rotate-180" />
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
                  src={guide.image || cdn.product("placeholder.svg")}
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
