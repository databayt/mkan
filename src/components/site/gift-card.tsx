"use client"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export default function GiftCard() {
  const dict = useDictionary()
  return (
    <div className="bg-[#ffffff] min-h-screen flex items-center justify-center">
      <div className="w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-16">
        {/* Left side - Text content */}
        <div className="flex-1 max-w-md text-center lg:text-start order-2 lg:order-1">
          <h1 className="text-[#000000] text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-6 lg:mb-8">
            {dict.home?.giftCard?.title?.split('\\n').map((line: string, i: number) => (
              <span key={i}>{line}{i < (dict.home?.giftCard?.title?.split('\\n').length ?? 1) - 1 && <br className="hidden sm:block" />}</span>
            ))}
          </h1>
          <Button className="bg-[#000000] text-[#ffffff] hover:bg-[#000000]/90 px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg font-medium rounded-lg">
            {dict.home?.giftCard?.button}
          </Button>
        </div>

        {/* Right side - Gift cards image */}
        <div className="flex-1 relative lg:ms-16 flex justify-center items-center order-1 lg:order-2 w-full max-w-lg lg:max-w-2xl">
          <div className="w-full">
            <Image
              src="/assets/gift-cards.png"
              alt={dict.home?.giftCard?.altText}
              width={800}
              height={400}
              className="w-full h-auto object-contain"
              priority
            />
          </div>
        </div>
      </div>
    </div>
  )
}
