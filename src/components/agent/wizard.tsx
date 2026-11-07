"use client";

import { useMemo } from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { QuestionCard, useQuestionContext } from "./question-card";
import { joiner, toMessage, wizardQuestions } from "./questions";
import type { Requirements } from "./requirements";
import type { QuestionAnswer } from "./types";

export type Picks = Partial<Requirements>;

/**
 * The guided search (⋯ Guided search, the composer's +, the starter card) on the
 * agent's question card: where in Kigali, what kind of home, what monthly budget —
 * one tap each, a line of help under every option, "Other" to type. "Show homes"
 * starts a new search with exactly the picked fields (the agent covers monthly
 * rentals only); a skipped question is left to the search. × closes it and the
 * composer is back.
 */
export function Wizard({
  onSubmit,
  onClose,
  disabled,
  compact = false,
}: {
  onSubmit: (text: string, filters: Picks, answers: QuestionAnswer[]) => void;
  onClose: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const ctx = useQuestionContext();
  const questions = useMemo(() => wizardQuestions(ctx), [ctx]);
  const finish = dict?.agent?.wizard?.finish ?? "Show homes";

  return (
    <QuestionCard
      questions={questions}
      submitLabel={finish}
      label={dict?.agent?.chat?.guided ?? "Guided search"}
      onClose={onClose}
      disabled={disabled}
      compact={compact}
      onSubmit={(picks) => {
        const message = toMessage(questions, picks, joiner(locale));
        onSubmit(message.text || finish, message.filters, message.answers);
      }}
    />
  );
}
