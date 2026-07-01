"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import type { Locale } from "@/components/internationalization/config"
import { updateProfile, updateProfilePhoto } from "@/lib/actions/profile-actions"
import { cn } from "@/lib/utils"

import { CameraIcon, PromptIcon, type PromptKey } from "./prompt-icons"
import {
  ProfileEditorDialog,
  PhotoEditorDialog,
  type EditorConfig,
  type EditorLabels,
} from "./prompt-editor"
import {
  DECADE_OPTIONS,
  PROMPT_KIND,
  headingStyle,
  initialOf,
  toProfileData,
  type ProfileData,
  type ProfileUser,
} from "./types"

/** Prompt order matches the captured DOM (row-major fill → 7 left / 6 right). */
const PROMPTS: PromptKey[] = [
  "decadeBorn", "whereWantedToGo", "work", "pets", "school", "spendTime",
  "song", "funFact", "uselessSkill", "obsessedWith", "languages", "bioTitle",
  "whereILive",
]

type EditableField = keyof Omit<ProfileData, "showPastTrips">

interface ProfileEditProps {
  user: ProfileUser
  lang: Locale
  initialProfile: ProfileData
}

export function ProfileEdit({ user, lang, initialProfile }: ProfileEditProps) {
  const dict = useDictionary()
  const router = useRouter()
  const t = dict.profile

  const [profile, setProfile] = useState<ProfileData>(initialProfile)
  const [image, setImage] = useState<string | null>(user.image)
  const [editor, setEditor] = useState<{ field: EditableField; config: EditorConfig } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)

  const labels: EditorLabels = {
    save: t?.save ?? "Save",
    cancel: t?.cancel ?? "Cancel",
    add: t?.add ?? "Add",
  }

  const openPrompt = (key: PromptKey) => {
    const kind = PROMPT_KIND[key]
    setEditor({
      field: key,
      config: {
        title: t?.prompts?.[key] ?? key,
        kind,
        value: profile[key],
        options: key === "decadeBorn" ? DECADE_OPTIONS : undefined,
        placeholder:
          kind === "select" ? t?.selectDecade ?? "Select a decade"
          : kind === "tags" ? t?.addTagPlaceholder ?? "Type and press Enter"
          : (t?.prompts?.[key] ?? ""),
        maxLength: key === "funFact" ? 160 : 80,
      },
    })
    setEditorOpen(true)
  }

  const openBio = () => {
    setEditor({
      field: "bio",
      config: {
        title: t?.aboutMeSection ?? "About me",
        kind: "textarea",
        value: profile.bio,
        placeholder: t?.writeIntroPlaceholder ?? "Write something fun and punchy.",
        maxLength: 450,
      },
    })
    setEditorOpen(true)
  }

  const openInterests = () => {
    setEditor({
      field: "interests",
      config: {
        title: t?.myInterests ?? "My interests",
        kind: "tags",
        value: profile.interests,
        placeholder: t?.addTagPlaceholder ?? "Type and press Enter",
      },
    })
    setEditorOpen(true)
  }

  const handleSave = async (value: string | string[] | null): Promise<boolean> => {
    if (!editor) return false
    const res = await updateProfile({ [editor.field]: value })
    if (res.ok) {
      setProfile(toProfileData(res.profile))
      return true
    }
    toast.error(res.error)
    return false
  }

  const togglePastTrips = async (checked: boolean) => {
    setProfile((p) => ({ ...p, showPastTrips: checked }))
    const res = await updateProfile({ showPastTrips: checked })
    if (!res.ok) {
      setProfile((p) => ({ ...p, showPastTrips: !checked }))
      toast.error(res.error)
    }
  }

  const savePhoto = async (next: string | null): Promise<boolean> => {
    const res = await updateProfilePhoto({ image: next })
    if (res.ok) {
      setImage(res.image)
      return true
    }
    toast.error(res.error)
    return false
  }

  return (
    <main id="main-content" className="pb-28">
      <div className="mx-auto w-full max-w-[980px] px-6 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-16">
          {/* Avatar column */}
          <div className="flex justify-center lg:sticky lg:top-[120px] lg:shrink-0 lg:justify-start">
            <div className="relative">
              <Avatar className="size-[214px]">
                {image ? <AvatarImage src={image} alt={user.name} /> : null}
                <AvatarFallback
                  style={{ backgroundColor: "#ede9fb", color: "#503eb2", fontSize: 132, fontWeight: 600 }}
                >
                  {initialOf(user.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => setPhotoOpen(true)}
                className="absolute -bottom-3 left-1/2 inline-flex h-9 -translate-x-1/2 items-center gap-2 rounded-full bg-background px-4 text-sm font-medium text-foreground"
                style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.12)", border: "1px solid rgba(0,0,0,0.04)" }}
              >
                <CameraIcon className="size-4" />
                {t?.add ?? "Add"}
              </button>
            </div>
          </div>

          {/* Content column */}
          <div className="w-full lg:max-w-[637px]">
            <h1 style={headingStyle.h1} className="text-foreground">
              {t?.myProfile ?? "My profile"}
            </h1>
            <p className="mt-6 mb-2 max-w-[85%] text-base leading-6 text-muted-foreground">
              {t?.myProfileBody ??
                "Hosts and guests can see your profile and it may appear across Mkan to help us build trust in our community."}{" "}
              <button type="button" className="font-medium text-foreground underline">
                {t?.learnMore ?? "Learn more"}
              </button>
            </p>

            {/* Prompt grid */}
            <div className="grid grid-cols-1 gap-y-0 lg:grid-cols-2 lg:gap-x-16">
              {PROMPTS.map((key) => {
                const value = profile[key]
                const filled = Array.isArray(value) ? value.length > 0 : Boolean(value)
                const display = Array.isArray(value) ? value.join(", ") : value
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openPrompt(key)}
                    className="flex w-full items-center gap-4 border-b border-border py-6 text-start transition-colors hover:opacity-80"
                  >
                    <PromptIcon name={key} className={filled ? "text-foreground" : "text-foreground/80"} />
                    <span
                      className={cn(
                        "line-clamp-1 text-base leading-5",
                        filled ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {filled ? display : t?.prompts?.[key] ?? key}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* About me intro */}
            <section className="mt-12">
              <h2 style={headingStyle.h2} className="text-foreground">
                {t?.aboutMeSection ?? "About me"}
              </h2>
              <button
                type="button"
                onClick={openBio}
                className="mt-6 flex w-full flex-col rounded-xl border border-dashed border-muted-foreground/40 px-4 py-6 text-start"
              >
                {profile.bio ? (
                  <span className="whitespace-pre-wrap text-base leading-6 text-foreground">{profile.bio}</span>
                ) : (
                  <>
                    <span className="mb-2 text-base leading-5 text-muted-foreground">
                      {t?.writeIntroPlaceholder ?? "Write something fun and punchy."}
                    </span>
                    <span className="text-base font-medium leading-5 text-foreground underline">
                      {t?.addIntro ?? "Add intro"}
                    </span>
                  </>
                )}
              </button>
            </section>

            {/* Where I've been */}
            <section className="mt-12 border-t border-border pt-12">
              <div className="flex items-center justify-between">
                <h2 style={headingStyle.h3} className="text-foreground">
                  {t?.whereIveBeen ?? "Where I've been"}
                </h2>
                <Switch
                  checked={profile.showPastTrips}
                  onCheckedChange={togglePastTrips}
                  aria-label={t?.whereIveBeen ?? "Where I've been"}
                />
              </div>
              <p className="mt-1 text-sm leading-[18px] text-muted-foreground">
                {t?.whereIveBeenBody ??
                  "Pick the stamps you want other people to see on your profile."}
              </p>
              <button
                type="button"
                disabled
                className="mt-4 cursor-not-allowed rounded-xl bg-muted px-6 py-3.5 text-base font-medium leading-5"
                style={{ color: "#c1c1c1" }}
              >
                {t?.editTravelStamps ?? "Edit travel stamps"}
              </button>
            </section>

            {/* My interests */}
            <section className="mt-12 border-t border-border pt-12">
              <h2 style={headingStyle.h3} className="text-foreground">
                {t?.myInterests ?? "My interests"}
              </h2>
              <p className="mt-1 text-base leading-5 text-muted-foreground">
                {t?.myInterestsBody ??
                  "Find common ground with other guests and hosts by adding interests to your profile."}
              </p>

              {profile.interests.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {profile.interests.map((i) => (
                    <Badge key={i} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                      {i}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap gap-3">
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={openInterests}
                      aria-label={t?.addInterests ?? "Add interests"}
                      className="inline-flex h-11 min-w-[72px] items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="size-5" />
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={openInterests}
                className="mt-6 rounded-xl bg-muted px-6 py-3.5 text-base font-medium leading-5 text-foreground transition-colors hover:bg-muted/70"
              >
                {t?.addInterests ?? "Add interests"}
              </button>
            </section>
          </div>
        </div>
      </div>

      {/* Fixed bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background px-6 py-4 lg:px-10">
        <div className="mx-auto flex w-full max-w-[980px] justify-end">
          <button
            type="button"
            onClick={() => router.push(`/${lang}/profile/about`)}
            className="rounded-lg bg-foreground px-6 py-3.5 text-base font-medium leading-5 text-background transition-opacity hover:opacity-90"
          >
            {t?.done ?? "Done"}
          </button>
        </div>
      </div>

      <ProfileEditorDialog
        config={editor?.config ?? null}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSave}
        labels={labels}
      />
      <PhotoEditorDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        currentImage={image}
        name={user.name}
        title={t?.changePhoto ?? "Change photo"}
        onSave={savePhoto}
        labels={labels}
      />
    </main>
  )
}
