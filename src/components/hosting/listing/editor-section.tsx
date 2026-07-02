"use client";

/**
 * Reusable right-pane shell for every listing-editor section.
 *
 * Mirrors the Airbnb listing editor surface: a section heading, an optional
 * one-line subtitle, the editable content, and a dirty-aware Save button that
 * stays disabled until something actually changes. No onboarding-style tip
 * boxes, previews, or Back/Next — the editor is intentionally minimal.
 */

import React from "react";
import { cn } from "@/lib/utils";

const MAX_WIDTHS = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-none",
} as const;

interface EditorSectionProps {
  title: string;
  subtitle?: string;
  /** Right-aligned controls beside the title (e.g. photo-tour actions). */
  headerAction?: React.ReactNode;
  maxWidth?: keyof typeof MAX_WIDTHS;
  children: React.ReactNode;
  className?: string;
}

export function EditorSection({
  title,
  subtitle,
  headerAction,
  maxWidth = "lg",
  children,
  className,
}: EditorSectionProps) {
  return (
    <div className={cn("mx-auto w-full pb-16", MAX_WIDTHS[maxWidth], className)}>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {headerAction ? (
          <div className="flex shrink-0 items-center gap-3">{headerAction}</div>
        ) : null}
      </div>
      {subtitle ? (
        <p className="mt-2 text-base text-muted-foreground">{subtitle}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  saveLabel?: string;
  savingLabel?: string;
  className?: string;
}

/**
 * Black Save button — disabled (greyed) until the section is dirty.
 * Desktop: inline bottom-start (unchanged). Mobile: pinned to the viewport
 * bottom as a full-width bar (Airbnb host-app save), with a hairline top
 * border so it reads as a bar while content scrolls beneath it.
 */
export function SaveBar({
  dirty,
  saving,
  onSave,
  saveLabel = "Save",
  savingLabel = "Saving…",
  className,
}: SaveBarProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 mt-8 flex border-t border-border bg-background py-3",
        "lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:py-0",
        className
      )}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold transition-colors lg:w-auto",
          "bg-foreground text-background hover:bg-foreground/90",
          "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        )}
      >
        {saving ? savingLabel : saveLabel}
      </button>
    </div>
  );
}

/** Lightweight skeleton shown while the editor context loads the listing. */
export function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl animate-pulse pb-16">
      <div className="h-8 w-48 rounded-md bg-muted" />
      <div className="mt-3 h-4 w-80 rounded bg-muted" />
      <div className="mt-10 h-40 w-full rounded-2xl bg-muted" />
      <div className="mt-8 h-12 w-28 rounded-lg bg-muted" />
    </div>
  );
}
