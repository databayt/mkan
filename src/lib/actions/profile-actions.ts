"use server"

import { z } from "zod"
import type { Profile } from "@prisma/client"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Free-text prompt: trims, caps length, empty/whitespace clears the field (→ null).
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullish()

const tags = (max: number, count: number) =>
  z.array(z.string().trim().min(1).max(max)).max(count)

const profileUpdateSchema = z
  .object({
    bio: text(450),
    decadeBorn: text(40),
    whereWantedToGo: text(80),
    work: text(80),
    pets: text(80),
    school: text(80),
    spendTime: text(120),
    song: text(120),
    funFact: text(160),
    uselessSkill: text(120),
    obsessedWith: text(120),
    bioTitle: text(80),
    whereILive: text(80),
    languages: tags(50, 20).optional(),
    interests: tags(50, 30).optional(),
    showPastTrips: z.boolean().optional(),
  })
  .partial()

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>

export type ProfileActionResult =
  | { ok: true; profile: Profile }
  | { ok: false; error: string }

/** Upsert the signed-in user's profile with any subset of fields. */
export async function updateProfile(input: unknown): Promise<ProfileActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = profileUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input" }
  const data = parsed.data

  try {
    const profile = await db.profile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
    return { ok: true, profile }
  } catch {
    return { ok: false, error: "Could not save profile" }
  }
}

const photoSchema = z.object({ image: z.string().url().max(2048).nullable() })

export type PhotoActionResult =
  | { ok: true; image: string | null }
  | { ok: false; error: string }

/** Set or clear the signed-in user's profile photo (User.image). */
export async function updateProfilePhoto(input: unknown): Promise<PhotoActionResult> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: "Unauthorized" }

  const parsed = photoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid image" }

  try {
    await db.user.update({ where: { id: userId }, data: { image: parsed.data.image } })
    return { ok: true, image: parsed.data.image }
  } catch {
    return { ok: false, error: "Could not save photo" }
  }
}
