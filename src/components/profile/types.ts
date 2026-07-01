import type { CSSProperties } from "react"
import type { Profile } from "@prisma/client"

/**
 * Plain, server-resolved props for the profile pages. The User model has no
 * bio/work/languages/verification fields yet, so the prompts/intro/interests
 * are an empty-state UI clone of airbnb.com/users/profile/about. Only name +
 * image + host flag are real data.
 */
export interface ProfileUser {
  id: string
  /** Display name derived server-side (username → email local-part). */
  name: string
  image: string | null
  isHost: boolean
}

/** Exact heading scales captured from airbnb.com (px → inline, RTL-safe). */
export const headingStyle: Record<"h1" | "h2" | "h3", CSSProperties> = {
  h1: { fontSize: 32, fontWeight: 600, lineHeight: "36px", letterSpacing: "-0.96px" },
  h2: { fontSize: 26, fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.52px" },
  h3: { fontSize: 22, fontWeight: 500, lineHeight: "26px", letterSpacing: "-0.44px" },
}

export function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase()
}

/** All editable profile fields, server-resolved (null / [] when unset). */
export interface ProfileData {
  bio: string | null
  decadeBorn: string | null
  whereWantedToGo: string | null
  work: string | null
  pets: string | null
  school: string | null
  spendTime: string | null
  song: string | null
  funFact: string | null
  uselessSkill: string | null
  obsessedWith: string | null
  bioTitle: string | null
  whereILive: string | null
  languages: string[]
  interests: string[]
  showPastTrips: boolean
}

export const EMPTY_PROFILE: ProfileData = {
  bio: null, decadeBorn: null, whereWantedToGo: null, work: null, pets: null,
  school: null, spendTime: null, song: null, funFact: null, uselessSkill: null,
  obsessedWith: null, bioTitle: null, whereILive: null,
  languages: [], interests: [], showPastTrips: false,
}

export const DECADE_OPTIONS = [
  "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s",
] as const

export type EditorKind = "text" | "select" | "tags"

/** Which editor each prompt opens. `languages` is multi-tag; `decadeBorn` is a picker. */
export const PROMPT_KIND: Record<import("./prompt-icons").PromptKey, EditorKind> = {
  decadeBorn: "select",
  languages: "tags",
  whereWantedToGo: "text",
  work: "text",
  pets: "text",
  school: "text",
  spendTime: "text",
  song: "text",
  funFact: "text",
  uselessSkill: "text",
  obsessedWith: "text",
  bioTitle: "text",
  whereILive: "text",
}

/** Map a Prisma Profile row to the client-facing ProfileData (drops id/timestamps). */
export function toProfileData(p: Profile): ProfileData {
  return {
    bio: p.bio, decadeBorn: p.decadeBorn, whereWantedToGo: p.whereWantedToGo,
    work: p.work, pets: p.pets, school: p.school, spendTime: p.spendTime,
    song: p.song, funFact: p.funFact, uselessSkill: p.uselessSkill,
    obsessedWith: p.obsessedWith, bioTitle: p.bioTitle, whereILive: p.whereILive,
    languages: p.languages, interests: p.interests, showPastTrips: p.showPastTrips,
  }
}
