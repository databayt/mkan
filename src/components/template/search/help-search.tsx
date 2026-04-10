"use client"

import SearchButton from "@/components/atom/search-button"
import { Input } from "@/components/ui/input"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export default function HelpSearch() {
  const dict = useDictionary()

  return (
    <div className="flex items-center justify-center p-4 pt-6">
      <div className="relative w-full max-w-sm">
        <div className="relative flex items-center">
          <Input
            type="text"
            placeholder={dict.search?.searchHowTos ?? "Search how-tos and more"}
            className="w-full h-14 ps-6 pe-16 text-base border rounded-full shadow-lg bg-[#ffffff] placeholder:text-[#6b7280] focus-visible:ring-2 focus-visible:ring-[#de3151] focus-visible:ring-offset-0"
          />
          <SearchButton
            size="small"
            className="absolute right-2 h-10 w-10 focus-visible:ring-2 focus-visible:ring-[#de3151] focus-visible:ring-offset-2"
          />
        </div>
      </div>
    </div>
  )
}
