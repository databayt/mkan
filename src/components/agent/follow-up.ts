import { parseBrokerReply } from "./broker-reply";
import type { AgentMessage, FollowUpKind } from "./types";
import { afterHomesKind, isBareYes, isThanks, wantsPerson } from "./whatsapp-format";

/**
 * Under the homes on /find, what a message that moves nothing about the search gets (2026-11-03).
 * Every message there ran a new search, so "How are you", "?", "Can we meet now" and "thanks" each
 * showed the same homes again. WhatsApp asks afterHomesKind the same question before a turn starts
 * (whatsapp-chat.ts); here a person, a bot question, a thank-you, a bare yes and a home's number are
 * read first, because on the web the cards are one tap away and no number picks one.
 */
export function followUpKind(text: string): FollowUpKind | "search" {
  const t = text.trim();
  if (wantsPerson(t)) return "person";
  if (parseBrokerReply(t).asksIfBot) return "about";
  if (isThanks(t)) return "thanks";
  if (isBareYes(t) || /^#?[1-9٠-٩]\.?$/.test(t)) return "check";
  return afterHomesKind(t);
}

/** The homes are still the subject: the agent's last turn showed them, or answered under them. */
export function underHomes(messages: AgentMessage[]): boolean {
  const last = messages.findLast((m) => m.role === "agent");
  return last?.role === "agent" && (last.kind === "shortlist" || last.kind === "followUp" || last.kind === "answer");
}
