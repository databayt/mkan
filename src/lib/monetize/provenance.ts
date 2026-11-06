/**
 * Where a piece of sprint text came from — the guard between /monetize's web forms and the Mac.
 *
 * The sprint runner (scripts/crm/hermes/sprint-runner.sh) hands a prompt's text to an unattended
 * Claude Code session with full permissions on Abdout's Mac, and the planner (scripts/sprint-cycle.ts)
 * reads tasks, lessons, retros and experiments into another. /monetize is public and its forms are one
 * admin login away, so anything typed there carries WEB_MARK, and every unattended reader — the claim,
 * the brief, the planner's context, the retro and the lessons — skips marked text until Abdout approves
 * it on the Mac (`pnpm sprint:approve <id>`, which refuses in an unattended run). 2026-11-06.
 *
 * The mark is the provenance itself (no column, no migration): a server action adds it, and no web
 * path can write text without it.
 */
export const WEB_MARK = "⏸ web · ";
const MARK_CORE = WEB_MARK.trim();

/** True for text a web form wrote and the Mac has not approved — at the start or anywhere inside. */
export function isWebText(text: string | null | undefined): boolean {
  return typeof text === "string" && text.includes(MARK_CORE);
}

/** Text from a web form, marked once. */
export function markWeb(text: string): string {
  return isWebText(text) ? text : `${WEB_MARK}${text}`;
}

/** The approved text: the mark taken off (the Mac's `sprint:approve`). */
export function unmarkWeb(text: string): string {
  return text.split(WEB_MARK).join("").split(MARK_CORE).join("").trim();
}

/** What a web-added prompt shows until it is approved. */
export const approvalHint = (id: string) => `Added on the web — it runs only after approval on the Mac: pnpm sprint:approve ${id}`;
