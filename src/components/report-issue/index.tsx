/**
 * Server-component wrapper. Reads the mkan session (next-auth) and renders the
 * client dialog. External code keeps importing `@/components/report-issue` as
 * before — the surface is unchanged for callers.
 */

import { auth } from "@/lib/auth";

import { reportIssue } from "@/lib/actions/report-issue";
import { ReportIssueDialog } from "./dialog";

export interface ReportIssueProps {
  variant?: "text" | "icon";
}

export async function ReportIssue({ variant }: ReportIssueProps = {}) {
  const session = await auth().catch(() => null);
  const hasSession = Boolean(session?.user);

  return (
    <ReportIssueDialog
      variant={variant}
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
