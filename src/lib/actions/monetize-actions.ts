"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { auth, isAdminOrSuper } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { BLOCKS } from "@/lib/monetize/types";
import { REVENUE_LINES } from "@/lib/monetize/money";

/**
 * /monetize writes: money received and the experiment log. Each action
 * re-checks the role — the page gate does not protect a server action, which
 * is a public POST endpoint.
 */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isAdminOrSuper(session)) throw new Error("Unauthorized");
  return session;
}

const revenueSchema = z.object({
  line: z.enum(REVENUE_LINES),
  amountRwf: z.coerce.number().int().positive().max(1_000_000_000),
  receivedAt: z.coerce.date().optional(),
  customer: z.string().trim().max(120).optional(),
  dealId: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

const blank = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v : undefined);

export async function addRevenueEntry(form: FormData): Promise<void> {
  const session = await requireAdmin();
  const data = revenueSchema.parse({
    line: form.get("line"),
    amountRwf: form.get("amountRwf"),
    receivedAt: blank(form.get("receivedAt")),
    customer: blank(form.get("customer")),
    dealId: blank(form.get("dealId")),
    note: blank(form.get("note")),
  });
  await db.revenueEntry.create({ data });
  logger.info("monetize:revenue", { actorId: session.user.id, line: data.line, amountRwf: data.amountRwf });
  revalidatePath("/[lang]/monetize", "page");
}

const experimentSchema = z.object({
  id: z.string().trim().max(40).optional(),
  block: z.enum(BLOCKS),
  hypothesis: z.string().trim().min(5).max(500),
  metric: z.string().trim().min(1).max(80),
  baseline: z.coerce.number().optional(),
  target: z.coerce.number().optional(),
  result: z.coerce.number().optional(),
  verdict: z.enum(["running", "won", "lost", "inconclusive"]).default("running"),
});

export async function saveExperiment(form: FormData): Promise<void> {
  const session = await requireAdmin();
  const get = (k: string) => blank(form.get(k));
  const data = experimentSchema.parse({
    id: get("id"),
    block: get("block"),
    hypothesis: get("hypothesis"),
    metric: get("metric"),
    baseline: get("baseline"),
    target: get("target"),
    result: get("result"),
    verdict: get("verdict"),
  });
  const { id, ...fields } = data;
  const endedAt = fields.verdict === "running" ? null : new Date();
  if (id) await db.experiment.update({ where: { id }, data: { ...fields, endedAt } });
  else await db.experiment.create({ data: { ...fields, endedAt } });
  logger.info("monetize:experiment", { actorId: session.user.id, block: fields.block, verdict: fields.verdict });
  revalidatePath("/[lang]/monetize", "page");
}

// ── the sprint plan ─────────────────────────────────────────────────────
// The page's sprint controls; the Mac's `pnpm sprint:*` (scripts/sprint.ts) writes the same rows.

const idOf = (form: FormData, name = "id") => z.string().trim().min(1).max(40).parse(form.get(name));

export async function toggleSprintTask(form: FormData): Promise<void> {
  await requireAdmin();
  const id = idOf(form);
  const task = await db.sprintTask.findUniqueOrThrow({ where: { id }, select: { done: true } });
  await db.sprintTask.update({ where: { id }, data: { done: !task.done, doneAt: task.done ? null : new Date() } });
  revalidatePath("/[lang]/monetize", "page");
}

const promptStatus = z.enum(["pending", "processed", "skipped"]);

export async function setPromptStatus(form: FormData): Promise<void> {
  await requireAdmin();
  const id = idOf(form);
  const status = promptStatus.parse(form.get("status"));
  const result = blank(form.get("result"));
  await db.sprintPrompt.update({
    where: { id },
    data: { status, processedAt: status === "pending" ? null : new Date(), ...(result ? { result: String(result).slice(0, 500) } : {}) },
  });
  revalidatePath("/[lang]/monetize", "page");
}

const sprintSchema = z.object({
  kind: z.enum(["WEEK", "MONTH"]),
  title: z.string().trim().min(2).max(120),
  goal: z.string().trim().max(300).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export async function saveSprint(form: FormData): Promise<void> {
  await requireAdmin();
  const data = sprintSchema.parse({
    kind: form.get("kind"),
    title: form.get("title"),
    goal: blank(form.get("goal")),
    startsAt: form.get("startsAt"),
    endsAt: form.get("endsAt"),
  });
  if (data.endsAt <= data.startsAt) throw new Error("The sprint ends before it starts");
  await db.sprint.create({ data });
  revalidatePath("/[lang]/monetize", "page");
}

export async function closeSprint(form: FormData): Promise<void> {
  await requireAdmin();
  await db.sprint.update({ where: { id: idOf(form) }, data: { status: "closed" } });
  revalidatePath("/[lang]/monetize", "page");
}

export async function addSprintTask(form: FormData): Promise<void> {
  await requireAdmin();
  const sprintId = idOf(form, "sprintId");
  const title = z.string().trim().min(2).max(200).parse(form.get("title"));
  const block = z.enum(BLOCKS).optional().parse(blank(form.get("block")));
  const order = await db.sprintTask.count({ where: { sprintId } });
  await db.sprintTask.create({ data: { sprintId, title, block, order } });
  revalidatePath("/[lang]/monetize", "page");
}

export async function addSprintPrompt(form: FormData): Promise<void> {
  await requireAdmin();
  const sprintId = idOf(form, "sprintId");
  const text = z.string().trim().min(5).max(4000).parse(form.get("text"));
  const taskId = blank(form.get("taskId")) ? idOf(form, "taskId") : undefined;
  const order = await db.sprintPrompt.count({ where: { sprintId } });
  await db.sprintPrompt.create({ data: { sprintId, text, taskId, order } });
  revalidatePath("/[lang]/monetize", "page");
}
