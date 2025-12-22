import { Button } from "@/components/ui/button"
import Image from "next/image"

export default function Ask() {
  return (
    <div className="relative w-full h-96 overflow-hidden rounded-2xl">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/airbnb/julia.png"
          alt="Smiling woman in red dress with green foliage background"
          fill
          className="object-cover"
          priority
        />
        {/* Optional overlay for better text readability */}
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-center h-full px-8 sm:px-12 lg:px-16">
        <div className="max-w-2xl">
          <h1 className="text-[#ffffff] text-5xl font-bold leading-tight mb-8">
            Questions
            <br />
            about
            <br />
            hosting?
          </h1>

          <Button
            className="bg-[#ffffff] text-[#374151] hover:bg-[#e5e7eb] text-lg px-8 py-6 rounded-lg font-semibold transition-colors duration-200"
            size="lg"
          >
            Ask a Superhost
          </Button>
        </div>
      </div>
    </div>
  )
}
