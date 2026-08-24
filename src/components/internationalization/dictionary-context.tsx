"use client"

import { createContext, use } from "react"
import type { Locale } from "./config"
import type { Dictionary } from "./dictionaries"
import { getDictionaryClient } from "./get-dictionary-client"

// Exported so the client-fallback hook in `use-dictionary.ts` can read it.
export const DictionaryContext = createContext<Dictionary | null>(null)

// One stable promise per locale: `use()` requires the same promise identity
// across renders, and a single promise means the JSON chunk is fetched exactly
// once per session (then served from the module cache).
const dictionaryPromises: Partial<Record<Locale, Promise<Dictionary>>> = {}
function loadDictionary(lang: Locale): Promise<Dictionary> {
  return (dictionaryPromises[lang] ??= getDictionaryClient(lang))
}

function DictionaryLoader({
  lang,
  children,
}: {
  lang: Locale
  children: React.ReactNode
}) {
  const dictionary = use(loadDictionary(lang))
  return (
    <DictionaryContext.Provider value={dictionary}>
      {children}
    </DictionaryContext.Provider>
  )
}

/**
 * Provides the dictionary to the client tree WITHOUT serializing it into the
 * RSC payload. The old shape (`dictionary` prop from the server layout) inlined
 * ~200 kB of JSON into every page's HTML — the single largest slice of the
 * document. Now the client imports the locale's JSON as a code-split,
 * immutable, cacheable chunk and reads it with `use()`.
 *
 * Timing notes:
 * - Prerender/SSR resolves the import before streaming, so served HTML is
 *   always the full page.
 * - Hydration keeps the server HTML visible while the chunk downloads
 *   (selective hydration) — no flash, interactivity just attaches a moment
 *   later.
 * - Locale switches happen inside Next's route transition, so the previous
 *   page stays visible until the new locale's chunk resolves.
 *
 * There is deliberately NO `<Suspense>` here, and that is load-bearing.
 *
 * This used to render `<Suspense fallback={null}>` around the loader. Because
 * this provider wraps `{children}` in the `[lang]` layout, that boundary was
 * an ancestor of every page in the app — and a boundary that suspends makes
 * React flush the shell to deliver the fallback, which commits the HTTP
 * response as 200. Every `notFound()` and every `redirect()` thrown while
 * rendering a page then arrived too late to set a status: the app served soft
 * 404s and downgraded permanent redirects to client-side hops (mkan#53).
 *
 * The fallback was never the point — the note above already recorded that it
 * "is never in the shell". With no boundary React cannot show a fallback, so
 * it simply waits for the import instead of flushing early, which is the
 * behaviour this component always wanted. Measured after the change: both
 * locales still render their strings in the served HTML.
 *
 * Do not reintroduce a boundary here. Put it around whatever actually needs
 * to stream, below the page's own 404/redirect decision.
 */
export function DictionaryProvider({
  lang,
  children,
}: {
  lang: Locale
  children: React.ReactNode
}) {
  return <DictionaryLoader lang={lang}>{children}</DictionaryLoader>
}

// The hook lives in `use-dictionary.ts` (context-first with a client-side
// fallback). Re-exported here so the existing imports
// (`@/components/internationalization/dictionary-context`) keep resolving.
export { useDictionary } from "./use-dictionary"
