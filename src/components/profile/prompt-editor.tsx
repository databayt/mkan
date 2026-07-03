"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageUpload } from "@/components/ui/image-upload"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import type { EditorKind } from "./types"
import { initialOf } from "./types"

export interface EditorConfig {
  title: string
  kind: EditorKind | "textarea"
  value: string | string[] | null
  options?: readonly string[]
  placeholder?: string
  maxLength?: number
}

export interface EditorLabels {
  save: string
  cancel: string
  add: string
}

/** One reusable modal for every prompt kind: text · textarea · select · tags. */
export function ProfileEditorDialog({
  config,
  open,
  onOpenChange,
  onSave,
  labels,
}: {
  config: EditorConfig | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (value: string | string[] | null) => Promise<boolean>
  labels: EditorLabels
}) {
  const [text, setText] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!config) return
    if (config.kind === "tags") {
      setTags(Array.isArray(config.value) ? config.value : [])
      setDraft("")
    } else {
      setText(typeof config.value === "string" ? config.value : "")
    }
  }, [config])

  if (!config) return null

  const addTag = () => {
    const v = draft.trim()
    if (v && !tags.includes(v)) setTags([...tags, v])
    setDraft("")
  }

  const handleSave = async () => {
    setSaving(true)
    const value =
      config.kind === "tags" ? tags : text.trim() === "" ? null : text.trim()
    const ok = await onSave(value)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>

        <div className="py-1">
          {config.kind === "text" && (
            <Input
              autoFocus
              value={text}
              maxLength={config.maxLength ?? 80}
              placeholder={config.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleSave()
                }
              }}
            />
          )}

          {config.kind === "textarea" && (
            <Textarea
              autoFocus
              rows={5}
              value={text}
              maxLength={config.maxLength ?? 450}
              placeholder={config.placeholder}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          {config.kind === "select" && (
            <Select value={text} onValueChange={setText}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={config.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {config.options?.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {config.kind === "tags" && (
            <div>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={draft}
                  placeholder={config.placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addTag}>
                  {labels.add}
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 py-1 ps-3 pe-1.5">
                      {tag}
                      <button
                        type="button"
                        aria-label={`${labels.cancel} ${tag}`}
                        onClick={() => setTags(tags.filter((t) => t !== tag))}
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Avatar photo picker — uploads to S3, persists on save. */
export function PhotoEditorDialog({
  open,
  onOpenChange,
  currentImage,
  name,
  title,
  onSave,
  labels,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  currentImage: string | null
  name: string
  title: string
  onSave: (image: string | null) => Promise<boolean>
  labels: EditorLabels
}) {
  const [image, setImage] = useState<string | null>(currentImage)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setImage(currentImage)
  }, [open, currentImage])

  const handleSave = async () => {
    setSaving(true)
    const ok = await onSave(image)
    setSaving(false)
    if (ok) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="size-28">
            {image ? <AvatarImage src={image} alt={name} /> : null}
            <AvatarFallback
              style={{ backgroundColor: "#ede9fb", color: "#503eb2", fontSize: 48, fontWeight: 600 }}
            >
              {initialOf(name)}
            </AvatarFallback>
          </Avatar>
          <div className="w-full">
            <ImageUpload
              type="profile"
              maxFiles={1}
              existingImages={currentImage ? [currentImage] : []}
              onImagesChange={(urls) => setImage(urls[0] ?? null)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {labels.cancel}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {labels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
