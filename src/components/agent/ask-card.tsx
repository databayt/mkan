"use client";

import { useMemo } from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { focusComposer, QuestionCard, useQuestionContext } from "./question-card";
import { buildQuestion } from "./questions";
import type { HardField, Requirements } from "./requirements";

/**
 * One question inside the conversation, on the question card's rows: the stay
 * (months or nights) or a budget, each option with a line on what it means —
 * budgets show the real move-in cost from cost.ts. A tap sends at once; "Other"
 * hands over to the composer. Refine's budget offer under the homes uses it too.
 */
export function AskCard({
  field,
  requirements,
  onPick,
  disabled,
  compact = false,
  title,
}: {
  /** Replaces the question line — a refine offer reads differently from a question. */
  title?: string;
  field: HardField;
  requirements: Partial<Requirements> | null;
  onPick: (text: string, filters: Partial<Requirements>) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const ctx = useQuestionContext(requirements);
  const question = useMemo(() => {
    const q = buildQuestion(field === "stay" ? "stay" : "maxPrice", ctx);
    return { ...q, title: title ?? dict?.agent?.ask?.[field] ?? q.title };
  }, [field, ctx, title, dict]);

  return (
    <QuestionCard
      variant="inline"
      questions={[question]}
      disabled={disabled}
      compact={compact}
      onOther={focusComposer}
      onSubmit={(picks) => {
        const option = question.options.find((o) => o.key === picks[question.id]?.key);
        if (option) onPick(option.label, option.filters);
      }}
    />
  );
}
