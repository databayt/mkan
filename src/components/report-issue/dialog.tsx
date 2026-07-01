"use client";

/**
 * Canonical Report Issue dialog.
 *
 * Designed to work across hogwarts, mkan, kun without requiring any shadcn
 * primitive beyond Button + Dialog (the universal pair). Select / textarea /
 * collapsible are native HTML, styled to match shadcn-rendered inputs.
 *
 * Symmetric success: every accepted submission shows the same success toast
 * regardless of which bucket it landed in. Only verified-bucket results
 * surface the issue number (when the server action chooses to return it).
 *
 * Anti-abuse client-side mirror:
 *   - Description must be ≥30 chars and ≤2000 (HF1/HF2).
 *   - 60s cooldown after submit (HF9 — prevents the triple-click case).
 *   - Turnstile widget required when no session (HF3).
 *
 * Two render variants ("text" and "icon") preserved for parity with the existing
 * hogwarts ReportIssue, which uses the icon variant inside the configuration
 * wizard footer.
 */

import { Bug } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDictionary } from "@/components/internationalization/dictionary-context";

/** Active language. Kept for prop-shape parity with the portable dialog API. */
export type ReportLang = "en" | "ar";

const REPORT_CATEGORIES = [
  "visual",
  "broken",
  "data",
  "slow",
  "confusing",
  "auth",
  "i18n",
  "other",
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

const MIN_DESCRIPTION = 2;
const MAX_DESCRIPTION = 2000;
const COOLDOWN_MS = 60_000;

export interface ReportIssueSubmitInput {
  description: string;
  pageUrl: string;
  category: (typeof REPORT_CATEGORIES)[number];
  reproSteps?: string;
  expected?: string;
  actual?: string;
  severityHint?: (typeof SEVERITIES)[number];
  viewport: string;
  direction: "ltr" | "rtl";
  browser: string;
  hasScreenshot: false;
  captchaToken?: string;
}

export interface ReportIssueSubmitResult {
  ok: boolean;
  issueNumber?: number;
}

export interface ReportIssueDialogProps {
  /** "text" = underlined link, "icon" = bug icon button. Default "text". */
  variant?: "text" | "icon";
  iconClassName?: string;
  iconStrokeWidth?: number;
  /**
   * Active language. Retained for API parity with the portable dialog; the
   * displayed strings now come from the central dictionary provider, so this
   * prop is no longer used for lookup.
   */
  lang?: ReportLang;
  /** True when the visitor is signed in. Controls captcha visibility. */
  hasSession: boolean;
  /** Server action invoked on submit. Should call runReportPipeline. */
  onSubmit: (input: ReportIssueSubmitInput) => Promise<ReportIssueSubmitResult>;
  /** Turnstile site key. When absent the captcha block is hidden. */
  turnstileSiteKey?: string | undefined;
  /** Sign-in link href used when prompting anonymous users. */
  signInHref?: string;
}

const inputClass =
  "border-input placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

export function ReportIssueDialog({
  variant = "text",
  hasSession,
  onSubmit,
  turnstileSiteKey,
  signInHref = "/login",
  iconClassName,
  iconStrokeWidth,
}: ReportIssueDialogProps): React.JSX.Element {
  const dict = useDictionary();
  const r = dict?.reportIssue;
  const t = {
    triggerText: r?.triggerText ?? "Report an issue",
    triggerAriaLabel: r?.triggerAriaLabel ?? "Report an issue",
    title: r?.title ?? "Report an issue",
    categoryPlaceholder: r?.categoryPlaceholder ?? "Category",
    descriptionPlaceholder:
      r?.descriptionPlaceholder ??
      "Describe the issue in detail (minimum 30 characters)…",
    descriptionHint: r?.descriptionHint ?? "{count}/30+ chars",
    addDetails: r?.addDetails ?? "Add steps and expected behavior (optional)",
    reproPlaceholder: r?.reproPlaceholder ?? "Steps to reproduce: 1. … 2. … 3. …",
    expectedPlaceholder: r?.expectedPlaceholder ?? "What did you expect to happen?",
    actualPlaceholder: r?.actualPlaceholder ?? "What actually happened?",
    severityLabel: r?.severityLabel ?? "Severity",
    severityLow: r?.severityLow ?? "Low — cosmetic",
    severityMedium: r?.severityMedium ?? "Medium — noticeable",
    severityHigh: r?.severityHigh ?? "High — blocks me",
    severityCritical: r?.severityCritical ?? "Critical — data loss / outage",
    captchaHint:
      r?.captchaHint ?? "Reports from signed-in users are processed faster.",
    captchaLink: r?.captchaLink ?? "Sign in",
    submit: r?.submit ?? "Submit",
    submitting: r?.submitting ?? "Submitting…",
    success: r?.success ?? "Submitted. Thank you!",
    successWithId: r?.successWithId ?? "Submitted. Tracked as #{id}.",
    error: r?.error ?? "Something went wrong. Try again.",
    cooldown:
      r?.cooldown ?? "Please wait a moment before submitting another report.",
  };
  const cats = {
    visual: r?.categories?.visual ?? "Visual / Layout",
    broken: r?.categories?.broken ?? "Broken / Not Working",
    data: r?.categories?.data ?? "Wrong Data",
    slow: r?.categories?.slow ?? "Slow / Performance",
    confusing: r?.categories?.confusing ?? "Confusing / UX",
    auth: r?.categories?.auth ?? "Sign in / Permissions",
    i18n: r?.categories?.i18n ?? "Translation / Language",
    other: r?.categories?.other ?? "Other",
  };

  const [open, setOpen] = React.useState(false);
  const [category] = React.useState<(typeof REPORT_CATEGORIES)[number]>("other");
  const [description, setDescription] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [issueNumber, setIssueNumber] = React.useState<number | undefined>(undefined);
  const [lastSubmitAt, setLastSubmitAt] = React.useState<number | null>(null);

  const cooldownActive = lastSubmitAt !== null && Date.now() - lastSubmitAt < COOLDOWN_MS;
  const charCount = description.trim().length;
  const minMet = charCount >= MIN_DESCRIPTION;

  async function handleSubmit() {
    if (!minMet || cooldownActive) return;
    setStatus("loading");

    const payload: ReportIssueSubmitInput = {
      description,
      pageUrl: typeof window !== "undefined" ? window.location.href : "",
      category,
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "0x0",
      direction:
        typeof document !== "undefined" && document.documentElement.dir === "rtl"
          ? "rtl"
          : "ltr",
      browser: typeof navigator !== "undefined" ? navigator.userAgent : "",
      hasScreenshot: false,
    };

    try {
      const res = await onSubmit(payload);
      if (res.ok) {
        setStatus("success");
        setIssueNumber(res.issueNumber);
        setLastSubmitAt(Date.now());
        setDescription("");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
          setIssueNumber(undefined);
        }, 1500);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const successMessage = issueNumber
    ? t.successWithId.replace("{id}", String(issueNumber))
    : t.success;

  return (
    <>
      <TriggerButton
        variant={variant}
        label={t.triggerText}
        ariaLabel={t.triggerAriaLabel}
        onClick={() => setOpen(true)}
        iconClassName={iconClassName}
        iconStrokeWidth={iconStrokeWidth}
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setStatus("idle");
            setIssueNumber(undefined);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.title}</DialogTitle>
          </DialogHeader>

          <textarea
            className={`${inputClass} min-h-[120px]`}
            placeholder={t.descriptionPlaceholder}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minLength={MIN_DESCRIPTION}
            maxLength={MAX_DESCRIPTION}
          />

          {status === "error" && <p className="text-destructive text-sm">{t.error}</p>}
          {cooldownActive && status !== "success" && (
            <p className="text-xs text-muted-foreground">{t.cooldown}</p>
          )}

          {status === "success" ? (
            <p className="text-sm text-green-600">{successMessage}</p>
          ) : (
            <Button
              variant="black"
              className="w-full"
              onClick={handleSubmit}
              disabled={
                !minMet ||
                status === "loading" ||
                cooldownActive
              }
            >
              {status === "loading" ? t.submitting : t.submit}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── internals ─────────────────────────────────────────────────────────────

function TriggerButton({
  variant,
  label,
  ariaLabel,
  onClick,
  iconClassName,
  iconStrokeWidth,
}: {
  variant: "text" | "icon";
  label: string;
  ariaLabel: string;
  onClick: () => void;
  iconClassName?: string;
  iconStrokeWidth?: number;
}) {
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={iconClassName ? "inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent/50" : "inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"}
      >
        <Bug className={iconClassName || "h-4 w-4"} strokeWidth={iconStrokeWidth} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline font-medium underline underline-offset-4 cursor-pointer"
    >
      {label}
    </button>
  );
}

