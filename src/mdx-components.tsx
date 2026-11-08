// Copyright (c) 2025-present databayt
// Licensed under SSPL-1.0 -- see LICENSE for details
// Ported from hogwarts' docs block (trimmed: no atoms, previews, media or diagrams).

// @ts-nocheck
import type { ComponentProps } from "react"
import Image, { type StaticImageData } from "next/image"

import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Callout } from "@/components/docs/callout"
import { CodeTabs } from "@/components/docs/code-tabs"
import { CopyButton } from "@/components/docs/copy-button"
import { CardGrid, DocCard } from "@/components/docs/doc-card"

const mdxComponents = {
  // Allows customizing built-in components, e.g. to add styling.
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "font-heading mt-2 scroll-m-28 text-3xl font-bold tracking-tight",
        className
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => {
    return (
      <h2
        id={props.children
          ?.toString()
          .replace(/ /g, "-")
          .replace(/'/g, "")
          .replace(/\?/g, "")
          .toLowerCase()}
        className={cn(
          "font-heading [&+]*:[code]:text-xl mt-10 scroll-m-28 text-xl font-medium tracking-tight first:mt-0 lg:mt-12 [&+.steps]:!mt-0 [&+.steps>h3]:!mt-4 [&+h3]:!mt-6 [&+p]:!mt-4",
          className
        )}
        {...props}
      />
    )
  },
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "font-heading mt-12 scroll-m-28 text-lg font-medium tracking-tight [&+p]:!mt-4 *:[code]:text-xl",
        className
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "font-heading mt-8 scroll-m-28 text-base font-medium tracking-tight",
        className
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "mt-8 scroll-m-28 text-base font-medium tracking-tight",
        className
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "mt-8 scroll-m-28 text-base font-medium tracking-tight",
        className
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn("font-medium underline underline-offset-4", className)}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("leading-relaxed [&:not(:first-child)]:mt-6", className)}
      {...props}
    />
  ),
  strong: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <strong className={cn("font-medium", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("my-6 ms-6 list-disc", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("my-6 ms-6 list-decimal", className)} {...props} />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("mt-2", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("mt-6 border-s-2 ps-6 italic", className)}
      {...props}
    />
  ),
  // Markdown images arrive from fumadocs remarkImage already measured: a
  // public/ or relative file as a static import (size inside `src`), a remote
  // URL with width/height strings. Measured images go through next/image so
  // they get a srcset and a reserved box; remote ones skip the optimiser,
  // which answers 400 for any host missing from images.remotePatterns.
  // Anything unmeasured stays a lazy <img>.
  img: ({
    className,
    alt,
    src,
    width,
    height,
    ...props
  }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
    src?: string | StaticImageData
  }) => {
    const imported = typeof src === "object" && src !== null
    const w = Number(width)
    const h = Number(height)
    if (imported || (w > 0 && h > 0)) {
      return (
        <Image
          src={src}
          width={imported ? undefined : w}
          height={imported ? undefined : h}
          alt={alt ?? ""}
          sizes="(min-width: 1024px) 896px, 100vw"
          unoptimized={typeof src === "string" && /^(https?:)?\/\//.test(src)}
          className={cn("rounded-md", className)}
          {...props}
        />
      )
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={cn("rounded-md", className)}
        alt={alt}
        src={src}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        {...props}
      />
    )
  },
  hr: ({ ...props }) => <hr className="my-4 md:my-8" {...props} />,
  table: ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="no-scrollbar my-6 w-full overflow-y-auto rounded-lg border">
      <table
        className={cn(
          "relative w-full overflow-hidden border-none text-sm [&_tbody_tr:last-child]:border-b-0",
          className
        )}
        {...props}
      />
    </div>
  ),
  tr: ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
    <tr className={cn("m-0 border-b", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "px-4 py-2 text-start font-bold [&[align=center]]:text-center [&[align=right]]:text-right rtl:[&[align=right]]:text-left",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "px-4 py-2 text-start whitespace-nowrap [&[align=center]]:text-center [&[align=right]]:text-right rtl:[&[align=right]]:text-left",
        className
      )}
      {...props}
    />
  ),
  pre: ({ className, children, ...props }: React.ComponentProps<"pre">) => {
    return (
      <pre
        className={cn(
          "no-scrollbar min-w-0 overflow-x-auto px-4 py-3.5 outline-none has-[[data-highlighted-line]]:px-0 has-[[data-line-numbers]]:px-0 has-[[data-slot=tabs]]:p-0",
          className
        )}
        {...props}
      >
        {children}
      </pre>
    )
  },
  figure: ({ className, ...props }: React.ComponentProps<"figure">) => {
    return <figure className={cn(className)} {...props} />
  },
  code: ({
    className,
    __raw__,
    __npm__,
    __yarn__,
    __pnpm__,
    __bun__,
    ...props
  }: React.ComponentProps<"code"> & {
    __raw__?: string
    __npm__?: string
    __yarn__?: string
    __pnpm__?: string
    __bun__?: string
  }) => {
    // Inline Code.
    if (typeof props.children === "string") {
      return (
        <code
          // Code is LTR: inside Arabic prose it must not be reordered (0002-05, /listings).
          dir="ltr"
          className={cn(
            "bg-muted relative rounded-md px-[0.3rem] py-[0.2rem] font-mono text-[0.8rem] break-words outline-none",
            className
          )}
          {...props}
        />
      )
    }

    // Default codeblock.
    return (
      <>
        {__raw__ && <CopyButton value={__raw__} />}
        <code {...props} />
      </>
    )
  },
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Callout,
  CardGrid,
  DocCard,
  CodeTabs,
  Tabs: ({ className, ...props }: ComponentProps<typeof Tabs>) => {
    return <Tabs className={cn("relative mt-6 w-full", className)} {...props} />
  },
  TabsList: ({ className, ...props }: ComponentProps<typeof TabsList>) => (
    <TabsList
      className={cn(
        "justify-start gap-4 rounded-none bg-transparent px-0",
        className
      )}
      {...props}
    />
  ),
  TabsTrigger: ({
    className,
    ...props
  }: ComponentProps<typeof TabsTrigger>) => (
    <TabsTrigger
      className={cn(
        "text-muted-foreground data-[state=active]:text-foreground data-[state=active]:border-primary dark:data-[state=active]:border-primary hover:text-primary rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-3 text-base data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent",
        className
      )}
      {...props}
    />
  ),
  TabsContent: ({
    className,
    ...props
  }: ComponentProps<typeof TabsContent>) => (
    <TabsContent
      className={cn(
        "relative [&_h3.font-heading]:text-base [&_h3.font-heading]:font-medium *:[figure]:first:mt-0 [&>.steps]:mt-6",
        className
      )}
      {...props}
    />
  ),
  Step: ({ className, ...props }: React.HTMLAttributes<HTMLElement>) => (
    <h3
      className={cn(
        "font-heading mt-8 scroll-m-32 text-lg font-medium tracking-tight",
        className
      )}
      {...props}
    />
  ),
  Steps: ({ ...props }) => (
    <div
      className="[&>h3]:step steps mb-12 [counter-reset:step] md:ms-4 md:border-s md:ps-8 *:[h3]:first:!mt-0"
      {...props}
    />
  ),
}

export function useMDXComponents(
  components: Record<string, React.ComponentType<any>>
): Record<string, React.ComponentType<any>> {
  return {
    ...mdxComponents,
    ...components,
  }
}

export { mdxComponents }
