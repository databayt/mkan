import { Prisma } from "@prisma/client";

/**
 * Who counts as a real person on /monetize and in the funnel (2026-11-08). Every chat the numbers
 * had shown until then was the team testing the bot — the WhatsApp numbers we tested from, the
 * browsers we tested /find in, the films kun's shoot flows record on production, and the profile-less
 * chats of the launch week — so "Chatbot effective 100%" was graded on us. They are left out of every
 * count of people, chats, picks and asks, so the scorecard and the sprint loop judge real renters
 * only. The bot's speed and errors still count on every chat: the bot is the bot, whoever writes.
 *
 *   - a chat with no profile: only the launch week's tests (10-16..10-20) — every chat has one since 10-21
 *   - Abdout's own contacts: WaState `personal:<digits>` (agent/personal.ts)
 *   - the team's phones: WaState `test-phones` (broker-sends.ts) — their picks never reach a broker
 *   - the team's browsers: WaState `team-profiles`, AgentProfile ids — marked by hand
 *     (scripts/monetize/team.ts add <profileId>), and by itself for a headless or automated browser
 *     (agent/actions.ts: kun's shoot flows run headless Chrome)
 *   - anyone signed in as an admin
 */
export const TEAM_PROFILES_KEY = "team-profiles";

/** SQL: the AgentProfile aliased `p` (NULL when a chat has none) is a real person, not us. */
export const REAL_PERSON = Prisma.sql`(
  p.id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'personal:' || replace(p."waPhone", '+', ''))
  AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE p."waPhone" IS NOT NULL AND w.key = 'test-phones' AND w.value @> to_jsonb(replace(p."waPhone", '+', '')))
  AND NOT EXISTS (SELECT 1 FROM "WaState" w WHERE w.key = 'team-profiles' AND w.value @> to_jsonb(p.id))
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE p."userId" IS NOT NULL AND u.id = p."userId" AND u.role IN ('ADMIN', 'SUPER_ADMIN'))
)`;

/** A stored id list (WaState value), as clean strings. */
export const idList = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()))] : [];

/**
 * A browser no renter uses: headless Chrome (kun's shoot flows, Playwright's default), a driver that
 * says so, or a crawler. Its chats are ours — the 11-08 film rehearsals sent five identical ones.
 */
export const isAutomatedBrowser = (userAgent: string | null | undefined): boolean =>
  !!userAgent && /HeadlessChrome|Playwright|Puppeteer|PhantomJS|Lighthouse|\bbot\b|crawler|spider/i.test(userAgent);
