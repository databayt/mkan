// Shared between availability-prompt (the always-mounted layout loader) and
// availability-check (the dialog, loaded on demand via next/dynamic). Keeping
// these two exports out of availability-check.tsx lets the prompt reference
// them without creating a static import edge that would drag the dialog —
// and its framer-motion + Radix Dialog subtree — into every route's JS.

export type StaleListing = {
  id: number;
  title: string;
  photoUrl: string | null;
  city: string | null;
};

export const AVAILABILITY_SNOOZE_COOKIE = "availabilityCheckDismissed";
