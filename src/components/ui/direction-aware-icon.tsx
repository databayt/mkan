"use client"

import { cloneElement, isValidElement, type ReactElement } from "react"

import { cn } from "@/lib/utils"

interface DirectionAwareIconProps {
  // The lucide icon element to wrap. We clone it so the same call site keeps
  // working with any prop the caller passes (size, strokeWidth, etc.).
  children: ReactElement<{ className?: string }>
  // When true, also flip in RTL. Defaults to true since this helper exists
  // specifically for chevrons / arrows whose meaning depends on text flow.
  flip?: boolean
  className?: string
}

/**
 * Mirror a directional icon under RTL. Use only for icons whose semantics
 * follow reading direction (chevrons, arrows). Don't wrap symbols like a
 * play button or a media skip arrow — those mean the same thing in any
 * direction.
 */
export function DirectionAwareIcon({
  children,
  flip = true,
  className,
}: DirectionAwareIconProps) {
  if (!isValidElement(children)) return null

  return cloneElement(children, {
    className: cn(
      children.props.className,
      flip && "rtl:rotate-180",
      className
    ),
  })
}
