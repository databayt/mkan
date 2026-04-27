"use client"

import { createContext, useContext } from "react"
import type { Dictionary } from "./dictionaries"
import en from "./en.json"

// English JSON acts as the static fallback so a client component used outside
// a DictionaryProvider (test fixtures, isolated demos, root error pages) still
// renders strings instead of throwing during the initial render.
const fallbackDictionary = en as unknown as Dictionary

const DictionaryContext = createContext<Dictionary | null>(null)

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

export function useDictionary(): Dictionary {
  const dictionary = useContext(DictionaryContext)
  if (!dictionary) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "useDictionary used outside DictionaryProvider — falling back to en.json"
      )
    }
    return fallbackDictionary
  }
  return dictionary
}
