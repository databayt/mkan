"use client"

// Copyright (c) 2025-present databayt
// Licensed under SSPL-1.0 -- see LICENSE for details
import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"

import type { docsSource } from "@/lib/source"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type TreeNode = (typeof docsSource.pageTree)["children"][number]
type PageNode = Extract<TreeNode, { type: "page" }>
type FolderNode = Extract<TreeNode, { type: "folder" }>
type Item = { url: string; name: React.ReactNode }
type Group = { id: string; label?: React.ReactNode; items: Item[] }

const STORAGE_KEY = "docs-sidebar-open"

const toItem = (node: PageNode): Item => ({ url: node.url, name: node.name })

/** Every page under a folder (its index first), nesting flattened. */
function flatten(folder: FolderNode): PageNode[] {
  const pages: PageNode[] = folder.index ? [folder.index] : []
  for (const child of folder.children) {
    if (child.type === "page") pages.push(child)
    else if (child.type === "folder") pages.push(...flatten(child))
  }
  return pages
}

/**
 * `meta.json` is a flat ordered list; a "---Label---" entry becomes a separator
 * and so a labeled, collapsible group. Folders are flattened into the current group.
 */
function buildGroups(children: readonly TreeNode[]): Group[] {
  const start: Group = { id: "start", items: [] }
  const groups: Group[] = [start]
  let current = start
  for (const node of children) {
    if (node.type === "separator") {
      current = { id: `s:${String(node.name)}`, label: node.name, items: [] }
      groups.push(current)
    } else if (node.type === "page") {
      current.items.push(toItem(node))
    } else if (node.type === "folder") {
      current.items.push(...flatten(node).map(toItem))
    }
  }
  return groups.filter((g) => g.items.length > 0)
}

/** Remembered open/closed choices; unreadable storage just means defaults. */
function readStored(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
  } catch {
    return {}
  }
}

export function DocsSidebar({
  tree,
  lang,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  tree: typeof docsSource.pageTree
  lang?: string
}) {
  const pathname = usePathname()
  const prefix = lang ? `/${lang}` : ""
  const groups = React.useMemo(
    () => buildGroups(tree.children),
    [tree]
  )

  const isActive = (url: string) =>
    pathname === `${prefix}${url}` || pathname === url
  // Groups start open; the visitor's last choice (localStorage) wins.
  const defaultOpen = (_g: Group) => true

  const [stored, setStored] = React.useState<Record<string, boolean>>({})
  const setOpen = React.useCallback((id: string, open: boolean) => {
    setStored((prev) => {
      const next = { ...prev, [id]: open }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [])
  // Landing on a page reopens its group, even one the visitor had closed.
  const activeId = groups.find((g) => g.items.some((i) => isActive(i.url)))?.id
  React.useEffect(() => {
    setStored((prev) => {
      const base = Object.keys(prev).length ? prev : readStored()
      return activeId && base[activeId] === false
        ? { ...base, [activeId]: true }
        : base
    })
  }, [activeId])

  const menu = (items: Item[]) => (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton
            asChild
            isActive={isActive(item.url)}
            className="data-[active=true]:border-accent data-[active=true]:bg-accent relative h-[30px] border border-transparent text-[0.8rem] font-medium"
          >
            <Link href={`${prefix}${item.url}`}>{item.name}</Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )

  return (
    <Sidebar
      className="sticky top-[calc(var(--header-height)+2rem)] z-30 hidden h-[calc(100svh-var(--footer-height)-4rem)] overscroll-none bg-transparent lg:flex"
      collapsible="none"
      {...props}
    >
      <SidebarContent className="overflow-x-hidden overflow-y-auto">
        <div className="ps-0 pt-2 pb-4">
          {groups.map((group) =>
            group.label ? (
              <Collapsible
                key={group.id}
                // The visitor's last choice wins over the default.
                open={stored[group.id] ?? defaultOpen(group)}
                onOpenChange={(open) => setOpen(group.id, open)}
                className="group/collapsible"
              >
                <SidebarGroup className="p-0">
                  <SidebarGroupLabel
                    asChild
                    className="text-muted-foreground hover:text-foreground font-medium"
                  >
                    <CollapsibleTrigger className="w-full justify-between">
                      {group.label}
                      <ChevronDown className="transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </CollapsibleTrigger>
                  </SidebarGroupLabel>
                  <CollapsibleContent>
                    <SidebarGroupContent>
                      {menu(group.items)}
                    </SidebarGroupContent>
                  </CollapsibleContent>
                </SidebarGroup>
              </Collapsible>
            ) : (
              <SidebarGroup key={group.id} className="p-0">
                <SidebarGroupContent>{menu(group.items)}</SidebarGroupContent>
              </SidebarGroup>
            )
          )}
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
