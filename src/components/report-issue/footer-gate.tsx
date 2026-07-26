"use client";

import { usePathname } from "next/navigation";

import { ReportIssueFooter } from "./footer";

/**
 * Pathname-gated Report-an-issue footer. The bare /travel landing renders the
 * full site footer (which already carries the Report-an-issue link), so the
 * shared footer is skipped there. Kept as a tiny client leaf so the travel
 * layout itself can stay a Server Component — the pathname check is the only
 * client concern it had.
 */
export function ReportIssueFooterGate() {
  const pathname = usePathname();
  const isLanding = /\/travel\/?$/.test(pathname ?? "");
  if (isLanding) return null;
  return <ReportIssueFooter />;
}
