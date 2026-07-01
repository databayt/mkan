"use client";

/**
 * Client wrapper. Resolves the session via `useSession()` instead of `auth()`
 * so this module is safe to import from client components (e.g. site-footer).
 * Importing the server `auth()` here transitively pulled `@/lib/db` and the
 * `pg` driver into the client bundle, which broke the Vercel build because
 * `pg/lib/connection-parameters.js` requires Node's `dns` module.
 */

import { useSession } from "next-auth/react";

import { reportIssue } from "@/lib/actions/report-issue";
import { ReportIssueDialog } from "./dialog";

export interface ReportIssueProps {
  variant?: "text" | "icon";
  iconClassName?: string;
  iconStrokeWidth?: number;
}

export function ReportIssue({ variant, iconClassName, iconStrokeWidth }: ReportIssueProps = {}) {
  const { data: session } = useSession();
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
    />
  );
}

export type {
  ReportIssueDialogProps,
  ReportIssueSubmitInput,
  ReportIssueSubmitResult,
} from "./dialog";
