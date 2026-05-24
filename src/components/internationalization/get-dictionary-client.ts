import type { Locale } from "./config"
import type { Dictionary } from "./dictionaries"

// Client-side dictionary loader. Mirror of the server loader in
// `dictionaries.ts`, but importable from client components (the server file is
// `import "server-only"`). Mkan uses a single `en.json`/`ar.json` per locale,
// so there is no feature-split merge to perform here.
const dictionaries = {
  en: () => import("./en.json").then((module) => module.default),
  ar: () => import("./ar.json").then((module) => module.default),
}

export const getDictionaryClient = async (
  locale: Locale
): Promise<Dictionary> => {
  const load = dictionaries[locale] ?? dictionaries.ar
  return (await load()) as Dictionary
}
