"use client"

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface SearchDropdownProps {
  children: ReactNode
  className?: string
  position?: "top-full" | "left-full"
  width?: "sm" | "md" | "lg" | "xl" | "full"
  showShadow?: boolean
}

export default function SearchDropdown({
  children,
  className,
  position = "top-full",
  width = "md",
  showShadow = true
}: SearchDropdownProps) {
  const positionClasses = {
    "top-full": "absolute top-full left-0 mt-2",
    "left-full": "absolute top-0 left-full ms-4"
  }

  const widthClasses = {
    sm: "w-80",
    md: "w-96", 
    lg: "w-[600px]",
    xl: "w-[800px]",
    full: "w-full"
  }

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-[#e5e7eb] p-6 z-10",
        showShadow && "shadow-lg",
        positionClasses[position],
        widthClasses[width],
        className
      )}
    >
      {children}
    </div>
  )
} 