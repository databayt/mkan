import "server-only";

/**
 * The day's "Today on Mkan" note (2026-11-15): written at 21:30 Kigali by /api/cron/today-note, after
 * the last TikTok slot, from facts only (note-pure.ts: count, areas, rent range, bedrooms).
 *
 * Claude phrases it through the agent's capped client — AGENT_CLAUDE=off, the monthly cap, the daily
 * pacing and AGENT_WRITER_LOCALES all apply, since `canWrite` is the writer's own gate — and every piece
 * goes through writer.ts `guardText`: no number the facts do not hold (a rent only as the facts'
 * own figure), no "available", the right script. A piece that fails, and any language Claude may not
 * write, gets the template. Kinyarwanda is always the template, and is kept for a native speaker's read.
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AGENT_MODEL, claudeClient, noteFailure, recordSpend } from "@/components/agent/claude";
import { allowedNumbers, canWrite, guardText, noteRwSamples } from "@/components/agent/writer";
import { todayPosts } from "@/lib/tt/homes";
import { noteFacts, noteNumbers, sameHomes, templateNote, type NoteFacts, type NoteLang } from "./note-pure";

const NOTE_TIMEOUT_MS = 6_000;
const MAX_NOTE = 260;
const NoteOut = z.object({ note: z.string() });

const SYSTEM = `You write the one short note on Mkan's "Today on Mkan" page: the homes Mkan posted on TikTok today for rent in Kigali, Rwanda. You get JSON facts: "lang" (en English, ar Arabic), "count" of homes, "areas", the monthly rent range "rentMin" and "rentMax" in Rwandan francs, and the bedrooms "bedsMin" and "bedsMax".

Write the note in the language "lang": 1–2 sentences, under 240 characters, warm and plain, the way a helpful local friend would say it. No emojis, no marketing words, no lists.

Hard rules:
- Use only the numbers in the facts. Write a rent as the exact figure with a thousands separator, like "RWF 300,000" — never "300k" and never a figure that is not in the facts.
- Name only the areas given.
- Never say a home is available, free, booked or taken: you do not know.
- Never invent a feature, a place, a link or a handle.
Put the note in "note".`;

async function phrase(facts: NoteFacts, lang: "en" | "ar"): Promise<string | null> {
  const client = claudeClient();
  if (!client) return null;
  try {
    const res = await client.messages.parse(
      {
        model: AGENT_MODEL,
        max_tokens: 600,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              lang,
              count: facts.count,
              areas: facts.areas[lang],
              rentMin: facts.rentMin,
              rentMax: facts.rentMax,
              bedsMin: facts.bedsMin,
              bedsMax: facts.bedsMax,
            }),
          },
        ],
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: zodOutputFormat(NoteOut) },
      },
      { timeout: NOTE_TIMEOUT_MS },
    );
    void recordSpend("agent-write", res.usage);
    if (res.stop_reason === "refusal" || !res.parsed_output) return null;
    return guardText(res.parsed_output.note, { allowed: allowedNumbers(noteNumbers(facts)), maxLen: MAX_NOTE, lang, anyConfirmed: false, allowMoney: true });
  } catch (err) {
    await noteFailure(err);
    console.warn(`[today] claude note failed — template: ${(err as Error).message}`);
    return null;
  }
}

export interface WrittenNote {
  en: string;
  ar: string;
  rw: string;
  writtenBy: "claude" | "template";
}

/** The three notes for a day's facts: Claude's where it may and passed the guard, else the template. */
export async function writeNote(facts: NoteFacts): Promise<WrittenNote> {
  const [en, ar] = await Promise.all(
    (["en", "ar"] as const).map(async (lang) => ((await canWrite(lang).catch(() => false)) ? await phrase(facts, lang) : null)),
  );
  const rw = templateNote(facts, "rw");
  await noteRwSamples(`today:${facts.day}`, [{ kind: "reply", text: rw, passed: true }]);
  return {
    en: en ?? templateNote(facts, "en"),
    ar: ar ?? templateNote(facts, "ar"),
    rw,
    writtenBy: en || ar ? "claude" : "template",
  };
}

export type NoteResult = { day: string; note: "none" | "kept" | "written"; count: number; writtenBy?: WrittenNote["writtenBy"] };

/**
 * Upsert the Kigali day's note. No posts, no note. A note already written by Claude for the same homes
 * is kept (the cron may run twice; it must not spend twice).
 */
export async function writeDailyNote(day: string): Promise<NoteResult> {
  const homes = await todayPosts(db, day);
  const facts = noteFacts(day, homes);
  if (!facts) return { day, note: "none", count: 0 };
  const existing = await db.dailyNote.findUnique({ where: { day }, select: { stats: true, writtenBy: true } });
  const known = (existing?.stats as { ids?: number[] } | null)?.ids;
  if (existing?.writtenBy === "claude" && sameHomes(known, facts.ids)) return { day, note: "kept", count: facts.count, writtenBy: "claude" };
  const w = await writeNote(facts);
  const stats = { ...facts, rwMachineWritten: true } as unknown as Prisma.InputJsonValue;
  await db.dailyNote.upsert({
    where: { day },
    create: { day, en: w.en, ar: w.ar, rw: w.rw, stats, writtenBy: w.writtenBy },
    update: { en: w.en, ar: w.ar, rw: w.rw, stats, writtenBy: w.writtenBy },
  });
  return { day, note: "written", count: facts.count, writtenBy: w.writtenBy };
}
