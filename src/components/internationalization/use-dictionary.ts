"use client"

import { useContext, useEffect, useState } from "react"

import type { Dictionary } from "./dictionaries"
import { DictionaryContext } from "./dictionary-context"
import { getDictionaryClient } from "./get-dictionary-client"
import { useLocale } from "./use-locale"

/**
 * Access the active dictionary.
 *
 * Returns the `Dictionary` directly (back-compat with every existing caller,
 * which do `const dict = useDictionary()` then `dict?.x?.y ?? "fallback"`).
 *
 * Reads the server-provided dictionary from context first (instant, no flash);
 * falls back to a client-side load only if rendered outside a provider. This
 * replaces the previous hard `throw`, which made the hook unusable outside the
 * `[lang]` layout tree.
 */
export function useDictionary(): Dictionary {
  // Context-first: the root layout provides this synchronously.
  const contextDict = useContext(DictionaryContext)
  const { locale } = useLocale()
  const [dictionary, setDictionary] = useState<Dictionary | null>(contextDict)

  useEffect(() => {
    // Provider supplied it — nothing to load.
    if (contextDict) return

    getDictionaryClient(locale)
      .then(setDictionary)
      .catch((error) => console.error("Failed to load dictionary:", error))
  }, [locale, contextDict])

  // Callers use optional chaining, so the brief null window (only when no
  // provider is present) degrades to their fallback strings safely.
  return (contextDict ?? dictionary) as Dictionary
}
