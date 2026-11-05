import "server-only";

import { db } from "@/lib/db";

import { EMPTY_SPRINTS, shapeLesson, shapeSprints, type LessonView, type SprintRow, type SprintsView } from "./sprint-shape";

/** The open sprints with their tasks and prompts. Empty, never a crash, before the migration lands. */
export async function loadSprints(): Promise<SprintsView> {
  const rows = (await db.sprint
    .findMany({
      where: { status: { not: "closed" } },
      orderBy: { startsAt: "desc" },
      take: 12,
      include: {
        tasks: { select: { id: true, title: true, block: true, order: true, done: true, doneAt: true } },
        prompts: {
          select: {
            id: true, taskId: true, order: true, text: true, status: true, processedAt: true, result: true,
            metric: true, baseline: true, unblockWhen: true, blockedAt: true, retries: true, auto: true,
          },
        },
      },
    })
    .catch(() => null)) as SprintRow[] | null;
  return rows ? shapeSprints(rows) : EMPTY_SPRINTS;
}

/** The latest lessons, newest first ("What we learned"). Empty, never a crash. */
export async function loadLessons(take = 8): Promise<LessonView[]> {
  const rows = await db.sprintLesson.findMany({ orderBy: { createdAt: "desc" }, take }).catch(() => []);
  return rows.map(shapeLesson);
}
