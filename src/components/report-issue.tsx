"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Bug } from "lucide-react"

import { reportIssue } from "@/lib/actions/report-issue"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const translations = {
  en: {
    link: "Report an issue",
    title: "Report an issue",
    placeholder: "Describe the issue...",
    submit: "Submit",
    submitting: "Submitting...",
    success: "Submitted. Thank you!",
    error: "Something went wrong. Try again.",
  },
  ar: {
    link: "\u0627\u0644\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",
    title: "\u0627\u0644\u0625\u0628\u0644\u0627\u063a \u0639\u0646 \u0645\u0634\u0643\u0644\u0629",
    placeholder: "\u0635\u0641 \u0627\u0644\u0645\u0634\u0643\u0644\u0629...",
    submit: "\u0625\u0631\u0633\u0627\u0644",
    submitting: "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644...",
    success: "\u062a\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644. \u0634\u0643\u0631\u0627\u064b \u0644\u0643!",
    error: "\u062d\u062f\u062b \u062e\u0637\u0623. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
  },
} as const

interface ReportIssueProps {
  variant?: "text" | "icon"
}

function parseBrowser(ua: string): string {
  if (ua.includes("Firefox/")) return `Firefox / ${getOS(ua)}`
  if (ua.includes("Edg/")) return `Edge / ${getOS(ua)}`
  if (ua.includes("Chrome/")) return `Chrome / ${getOS(ua)}`
  if (ua.includes("Safari/")) return `Safari / ${getOS(ua)}`
  return ua.slice(0, 50)
}

function getOS(ua: string): string {
  if (ua.includes("Mac OS")) return "macOS"
  if (ua.includes("Windows")) return "Windows"
  if (ua.includes("Android")) return "Android"
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS"
  if (ua.includes("Linux")) return "Linux"
  return "Unknown"
}

export function ReportIssue({ variant = "text" }: ReportIssueProps) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle")
  const pathname = usePathname()
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"]

  async function handleSubmit() {
    if (!description.trim()) return
    setStatus("loading")
    try {
      await reportIssue({
        description,
        pageUrl: window.location.href,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        direction: document.documentElement.dir || "ltr",
        browser: parseBrowser(navigator.userAgent),
      })
      setStatus("success")
      setDescription("")
      setTimeout(() => {
        setOpen(false)
        setStatus("idle")
      }, 1500)
    } catch {
      setStatus("error")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setStatus("idle")
      }}
    >
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <button
            className="cursor-pointer"
            aria-label={t.link}
          >
            <Bug className="h-6 w-6" strokeWidth={1} />
          </button>
        ) : (
          <button className="cursor-pointer font-medium underline underline-offset-4">
            {t.link}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
        </DialogHeader>
        <textarea
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring min-h-[120px] w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none"
          placeholder={t.placeholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {status === "error" && (
          <p className="text-destructive text-sm">{t.error}</p>
        )}
        {status === "success" ? (
          <p className="text-sm text-green-600">{t.success}</p>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!description.trim() || status === "loading"}
          >
            {status === "loading" ? t.submitting : t.submit}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
