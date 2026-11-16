/**
 * A browser the team marked as its own on /monetize ("This browser is the team's", 2026-11-16). Its visits,
 * taps and chats never count as people reaching Mkan: launch week's numbers were mostly the team testing
 * from anonymous browsers, and a number decided on has to be clean. Set by the admin action, read by
 * /api/track (signals) — one name for both.
 */
export const TEAM_COOKIE = "mkan_team";
/** A year: the mark should outlive any test session. */
export const TEAM_COOKIE_MAX_AGE = 365 * 24 * 3600;
