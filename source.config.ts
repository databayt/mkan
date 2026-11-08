// Ported from hogwarts' docs block — fumadocs-mdx collections for /[lang]/docs.
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config"
import rehypePrettyCode from "rehype-pretty-code"
import { z } from "zod"

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

// `flow` names the published media for a guide (<FlowMedia flow>), the same
// convention as hogwarts' help center; summary/keywords describe the guide.
const schema = frontmatterSchema.extend({
  flow: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
})

export const docs = defineDocs({
  dir: "content/docs-en",
  docs: { schema },
})

export const docsArabic = defineDocs({
  dir: "content/docs-ar",
  docs: { schema },
})
