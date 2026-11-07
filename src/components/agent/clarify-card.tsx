"use client";

import { useMemo } from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import type { ClarifyField } from "./fields";
import { QuestionCard, useQuestionContext } from "./question-card";
import { clarifyQuestions, joiner, toMessage } from "./questions";
import type { Requirements } from "./requirements";
import type { QuestionAnswer } from "./types";

/**
 * The agent's own questions when a first message is too vague to search well
 * (run.ts `clarify`: home, furnishing, purpose — most result-changing first), on
 * the question card. Its Submit sends one message with every answered field; a
 * skipped question stays unset, nothing is guessed for it. The answers picked so
 * far travel with a message typed in the composer instead (`onDraft`).
 */
export function ClarifyCard({
  fields,
  onSubmit,
  onDraft,
  onClose,
  disabled,
  compact = false,
}: {
  fields: ClarifyField[];
  onSubmit: (text: string, filters: Partial<Requirements>, answers: QuestionAnswer[]) => void;
  /** The answers so far, for a message typed in the composer instead. */
  onDraft?: (filters: Partial<Requirements>) => void;
  onClose?: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const ctx = useQuestionContext();
  const questions = useMemo(() => clarifyQuestions(fields, ctx), [fields, ctx]);
  const fallback = dict?.agent?.wizard?.finish ?? "Show homes";

  return (
    <QuestionCard
      questions={questions}
      label={dict?.agent?.questionCard?.label ?? "Questions"}
      onClose={onClose}
      disabled={disabled}
      compact={compact}
      onChange={(picks) => onDraft?.(toMessage(questions, picks, joiner(locale)).filters)}
      onSubmit={(picks) => {
        const message = toMessage(questions, picks, joiner(locale));
        onSubmit(message.text || fallback, message.filters, message.answers);
      }}
    />
  );
}
