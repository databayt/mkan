"use client"

import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface SearchButtonProps {
  size?: "small" | "big"
  onClick?: () => void
  className?: string
  showText?: boolean
  disabled?: boolean
}

export default function SearchButton({
  size = "small",
  onClick,
  className,
  showText = false,
  disabled = false
}: SearchButtonProps) {
  const isBig = size === "big"
  const dict = useDictionary()
  const t = dict?.atom?.searchButton
  const label = t?.label ?? "Search"

  return (
    <Button
      onClick={onClick}
      size="icon"
      disabled={disabled}
      className={cn(
        isBig
          ? "w-28 h-14 px-4"
          : "w-8 h-8",
        className
      )}
    >
      <Search className="w-4 h-4" />
      {showText && isBig && (
        <span className="ms-2 text-sm font-medium">{label}</span>
      )}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
