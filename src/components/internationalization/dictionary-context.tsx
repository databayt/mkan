"use client"

import { createContext } from "react"
import type { Dictionary } from "./dictionaries"

// Exported so the client-fallback hook in `use-dictionary.ts` can read it.
export const DictionaryContext = createContext<Dictionary | null>(null)

export function DictionaryProvider({
  dictionary,
  children,
}: {
  dictionary: Dictionary
  children: React.ReactNode
}) {
  return (
    <DictionaryContext.Provider value={dictionary}>
      {children}
    </DictionaryContext.Provider>
  )
}

// The hook lives in `use-dictionary.ts` (context-first with a client-side
// fallback). Re-exported here so the existing imports
// (`@/components/internationalization/dictionary-context`) keep resolving.
export { useDictionary } from "./use-dictionary"
