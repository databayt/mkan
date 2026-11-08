// Ported from hogwarts' docs block — fumadocs-mdx collections for /[lang]/docs.
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config"
import rehypePrettyCode from "rehype-pretty-code"

import { transformers } from "./src/lib/highlight-code"

export default defineConfig({
  mdxOptions: {
    rehypePlugins: (plugins) => {
      plugins.shift()
      plugins.push([
        rehypePrettyCode as any,
        {
          theme: {
            dark: "github-dark",
            light: "github-light-default",
          },
          transformers,
        },
      ])

      return plugins
    },
  },
})

export const docs = defineDocs({
  dir: "content/docs-en",
  docs: { schema: frontmatterSchema },
})

export const docsArabic = defineDocs({
  dir: "content/docs-ar",
  docs: { schema: frontmatterSchema },
})
