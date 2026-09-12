"use client";

/**
 * Client wrapper. Resolves the session via `useSession()` instead of `auth()`
 * so this module is safe to import from client components (e.g. site-footer).
 * Importing the server `auth()` here transitively pulled `@/lib/db` and the
 * `pg` driver into the client bundle, which broke the Vercel build because
 * `pg/lib/connection-parameters.js` requires Node's `dns` module.
 *
 * Strings come from mkan's central dictionary (`reportIssue` block in
 * en.json / ar.json) and are passed to the canonical dialog as overrides; any
 * key the dictionary lacks falls back to the dialog's built-in bilingual copy.
 */

import { useSession } from "next-auth/react";

import { useDictionary } from "@/components/internationalization/dictionary-context";
import { reportIssue } from "@/lib/actions/report-issue";

import { ReportIssueDialog } from "./dialog";
import { REPORT_DICTIONARY, type ReportDict, type ReportDictKey } from "./dictionary";

export interface ReportIssueProps {
  variant?: "text" | "icon";
  iconClassName?: string;
  iconStrokeWidth?: number;
}

const DICT_KEYS = Object.keys(REPORT_DICTIONARY.en) as ReportDictKey[];

export function ReportIssue({ variant, iconClassName, iconStrokeWidth }: ReportIssueProps = {}) {
  const { data: session } = useSession();
  const dict = useDictionary();
  const hasSession = Boolean(session?.user);

  return (
    <ReportIssueDialog
      variant={variant}
      iconClassName={iconClassName}
      iconStrokeWidth={iconStrokeWidth}
      hasSession={hasSession}
      onSubmit={reportIssue}
      turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      signInHref="/login"
      strings={pickStrings((dict as { reportIssue?: unknown } | null | undefined)?.reportIssue)}
    />
  );
}

/** Keep only the dictionary keys the dialog knows, and only non-empty strings. */
function pickStrings(source: unknown): Partial<ReportDict> | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const out: Partial<ReportDict> = {};
  for (const key of DICT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

export type {
  ReportIssueDialogProps,
  ReportIssueSubmitInput,
  ReportIssueSubmitResult,
} from "./dialog";
