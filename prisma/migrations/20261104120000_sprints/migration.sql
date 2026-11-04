-- 2026-11-04: /monetize sprint plan — sprints, their tasks and the prompts that
-- carry them out. Additive only.

-- CreateTable
CREATE TABLE "Sprint" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintTask" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "block" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "SprintTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintPrompt" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "taskId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "processedAt" TIMESTAMP(3),
    "result" TEXT,

    CONSTRAINT "SprintPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sprint_kind_startsAt_idx" ON "Sprint"("kind", "startsAt");

-- CreateIndex
CREATE INDEX "SprintTask_sprintId_order_idx" ON "SprintTask"("sprintId", "order");

-- CreateIndex
CREATE INDEX "SprintPrompt_sprintId_order_idx" ON "SprintPrompt"("sprintId", "order");

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPrompt" ADD CONSTRAINT "SprintPrompt_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintPrompt" ADD CONSTRAINT "SprintPrompt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SprintTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
