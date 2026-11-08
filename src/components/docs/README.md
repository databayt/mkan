# docs block

The `/[lang]/docs` documentation site — ported from hogwarts' `src/components/docs`
(fumadocs-mdx, shadcn-docs style), trimmed to what mkan needs.

| Piece | Where |
| --- | --- |
| Content | `content/docs-en/`, `content/docs-ar/` — MDX + `meta.json` (order; `---Label---` = sidebar group) |
| Collections | `source.config.ts` → generated `.source/` (by `fumadocs-mdx`, run on `postinstall` and by `next dev/build`) |
| Loaders | `src/lib/source.ts` (`docsSource`, `docsArabicSource`) |
| Routes | `src/app/[lang]/docs/layout.tsx`, `[[...slug]]/page.tsx` |
| MDX map | `src/mdx-components.tsx` — `Callout`, `CardGrid`/`DocCard`, `Steps`/`Step`, `Tabs`, `Accordion`, `CodeTabs` |
| Styles | `src/styles/docs.css` (step counter, code blocks) |
| i18n | `docs.*` keys in `src/components/internationalization/{en,ar,rw}.json` |

Locales: `ar` reads the Arabic tree and falls back to English per page; `en` reads English;
`rw` reads English under the `docs.notTranslated` notice. Inline code renders LTR.

Not ported from hogwarts: component/atom previews, media/video, mermaid and structure
diagrams, prompt library, role-grouped help sidebar, package-manager command tabs.

Add a page: create `content/docs-ar/<slug>.mdx` and `content/docs-en/<slug>.mdx`
(frontmatter `title` + `description` are required), then list `<slug>` in both `meta.json`.
