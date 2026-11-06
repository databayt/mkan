/**
 * /monetize as an anonymous visitor may see it (the page is public since 2026-11-03, noindex).
 *
 * The numbers stay; the people go. Sprint prompts, results and lessons are written by Claude sessions
 * that read real chats, so they can carry a tenant's phone number, a broker's handle, an email or a
 * path on the Mac — all masked here (src/lib/redact.ts). A broker's handle beside a home's code would
 * let a reader go round Mkan, so first-share rows lose it. Applied on the server, before any client
 * component, so nothing personal sits in the HTML or the RSC payload. Admins get the raw data.
 */
import { redactPublic } from "@/lib/redact";

import type { MonetizeOverview } from "./load";
import type { SprintPromptView, SprintView } from "./sprint-shape";

const r = (t: string | null | undefined) => (t == null ? t : redactPublic(t)) as string;

function publicPrompt(p: SprintPromptView): SprintPromptView {
  return { ...p, text: r(p.text), result: p.result == null ? null : r(p.result), taskTitle: p.taskTitle == null ? null : r(p.taskTitle) };
}

function publicSprint(s: SprintView | null): SprintView | null {
  if (!s) return s;
  return {
    ...s,
    title: r(s.title),
    goal: s.goal == null ? null : r(s.goal),
    tasks: s.tasks.map((t) => ({ ...t, title: r(t.title) })),
    prompts: s.prompts.map(publicPrompt),
  };
}

export function toPublic(data: MonetizeOverview): MonetizeOverview {
  return {
    ...data,
    sprints: {
      ...data.sprints,
      week: publicSprint(data.sprints.week),
      month: publicSprint(data.sprints.month),
      prompts: data.sprints.prompts.map(publicPrompt),
    },
    lessons: data.lessons.map((l) => ({ ...l, text: r(l.text) })),
    blocks: data.blocks.map((b) => ({ ...b, jobs: b.jobs.map((j) => ({ ...j, summary: j.summary == null ? j.summary : r(j.summary) })) })),
    experiments: data.experiments.map((e) => ({ ...e, hypothesis: r(e.hypothesis) })),
    firstShare: data.firstShare && {
      ...data.firstShare,
      posts: data.firstShare.posts.map((p) => ({ ...p, brokerHandle: null, reason: p.reason == null ? null : r(p.reason) })),
    },
  };
}
