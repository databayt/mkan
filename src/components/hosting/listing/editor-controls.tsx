"use client";

/**
 * Shared, Airbnb-styled form controls + a dirty-field hook for editor sections.
 * Keeps every section page a thin composition instead of bespoke markup.
 */

import React from "react";
import { cn } from "@/lib/utils";
import { useEditor, type EditorListing } from "./editor-context";

/**
 * Tracks local edits against the server value. Resets automatically when the
 * underlying listing changes (e.g. after a successful save re-fetch).
 */
export function useEditorField<T>(
  select: (l: EditorListing) => T,
  fallback: T
) {
  const { listing, save, saving } = useEditor();
  const serverValue = listing ? select(listing) : fallback;
  const serialized = JSON.stringify(serverValue);
  const [value, setValue] = React.useState<T>(serverValue);

  React.useEffect(() => {
    setValue(JSON.parse(serialized) as T);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  const dirty = JSON.stringify(value) !== serialized;
  return { value, setValue, dirty, saving, save, listing };
}

/* ----------------------------- Stepper ----------------------------- */

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 50,
  label,
  hint,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-6 last:border-b-0">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-8 items-center justify-center rounded-full border border-input text-foreground transition hover:border-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden style={{ fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" }}>
            <path d="M5 12h14" />
          </svg>
        </button>
        <span className="w-6 text-center tabular-nums font-medium">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-8 items-center justify-center rounded-full border border-input text-foreground transition hover:border-foreground disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden style={{ fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "round" }}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- Toggle row ----------------------------- */

export function ToggleRow({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-border py-5 last:border-b-0">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-foreground" : "bg-input"
        )}
      >
        <span
          className={cn(
            "inline-block size-5 rounded-full bg-background shadow transition-transform",
            checked ? "translate-x-6 rtl:-translate-x-6" : "translate-x-1 rtl:-translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

/* ----------------------------- Option card ----------------------------- */

export function OptionCard({
  selected,
  onClick,
  title,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-selected={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border border-border p-4 text-start transition",
        "hover:border-foreground",
        "data-[selected=true]:border-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-foreground"
      )}
    >
      {icon ? <div className="mt-0.5 shrink-0 text-foreground">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <span
        className={cn(
          "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-foreground" : "border-input"
        )}
      >
        {selected ? <span className="size-2.5 rounded-full bg-foreground" /> : null}
      </span>
    </button>
  );
}

/* ----------------------------- Text inputs ----------------------------- */

export function TextField({
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  prefix?: React.ReactNode;
}) {
  return (
    <div className="flex items-center rounded-xl border border-input bg-background px-4 transition focus-within:border-foreground">
      {prefix ? <span className="me-2 text-muted-foreground">{prefix}</span> : null}
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent py-3.5 text-base outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 5,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full resize-none rounded-xl border border-input bg-background p-4 text-base outline-none transition placeholder:text-muted-foreground focus:border-foreground"
    />
  );
}

export function Counter({ value, max }: { value: number; max: number }) {
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {value}/{max}
    </p>
  );
}
