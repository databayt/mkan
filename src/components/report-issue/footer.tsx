"use client";

import { ReportIssue } from "@/components/report-issue";

/**
 * Shared "Report an issue" footer for app surfaces that have no site footer of
 * their own (the hosting dashboard, the listing editor). Mirrors the placement
 * hogwarts uses for its dashboard ReportIssueFooter so the entry point looks and
 * behaves the same across every databayt product.
 */
export function ReportIssueFooter() {
  return (
    <div className="text-muted-foreground pt-8 pb-6 text-start text-sm">
      <ReportIssue />
    </div>
  );
}
