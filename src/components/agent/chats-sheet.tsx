"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brain, ChevronLeft, Heart, House, Loader2, MoreHorizontal, SquarePen } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-context";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { deleteAgentChat } from "./actions";
import { groupChats } from "./chat-list";
import { chatTitle } from "./chips";
import { headerButton } from "./header";
import { MemoryView } from "./memory-view";
import { SavedView } from "./saved-view";
import type { AgentChatRow, AgentChatsView } from "./types";

/**
 * The ☰ sheet — ChatGPT's drawer on iOS. Mkan in large bold type, a row of
 * round tiles (Saved homes and Memory open as views inside the sheet, with a
 * back chevron — no sheet on a sheet; Homes goes to the listings), then this
 * tenant's chats under bold day heads, and a floating black "✎ Chat" pill for
 * a new chat. A row opens its chat, ⋯ deletes it after an
 * inline "Delete this chat?" (no portal, so it works over the bubble panel
 * too). Anonymous chats live in this browser, and the footer says so with a
 * way to sign in and keep them everywhere.
 *
 * It renders at z-60: above the bubble panel (z-55) it can be opened from.
 */
export function ChatsSheet({
  open,
  onOpenChange,
  activeId,
  onOpenChat,
  onNewChat,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string | null;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
  /** A deleted chat that is the one on screen must give way to a new one. */
  onDeleted?: (id: string) => void;
}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const s = a?.chats;
  const { locale } = useLocale();
  const [data, setData] = useState<AgentChatsView | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [view, setView] = useState<"chats" | "saved" | "memory">("chats");
  const { ids: savedIds } = useFavorites();
  const money = useCallback((n: number) => formatCurrency(n, locale, "RWF"), [locale]);
  const remembered = !!data?.memory && (Object.keys(data.memory.prefs).length > 0 || data.memory.notes.length > 0);
  const viewTitle = view === "saved" ? s?.saved ?? "Saved homes" : view === "memory" ? s?.memory ?? "Memory" : null;

  // Fresh on every open (a chat may have moved, finished or heard from a broker since);
  // the last list shows meanwhile.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void fetchChats().then((next) => {
      if (!live) return;
      setFailed(!next);
      if (next) setData(next);
    });
    return () => {
      live = false;
    };
  }, [open, reloads]);

  const loadMore = async (before: string) => {
    setMore(true);
    const next = await fetchChats(before);
    if (next) setData((prev) => (prev ? { ...next, chats: [...prev.chats, ...next.chats] } : next));
    setMore(false);
  };

  const remove = async (id: string) => {
    setData((d) => (d ? { ...d, chats: d.chats.filter((c) => c.id !== id) } : d));
    const res = await deleteAgentChat(id).catch(() => ({ ok: false }));
    if (!res.ok) setReloads((n) => n + 1);
    else onDeleted?.(id);
  };

  const groups = useMemo(() => groupChats(data?.chats ?? []), [data]);
  const groupLabel = s?.groups as Record<string, string> | undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setView("chats");
      }}
    >
      <SheetContent
        side="left"
        showClose={false}
        overlayClassName="z-[60]"
        className="z-[60] w-[88%] max-w-[360px] gap-0 p-0 sm:max-w-[360px]"
      >
        <SheetTitle className="sr-only">{s?.title ?? "Chats"}</SheetTitle>
        <SheetDescription className="sr-only">{s?.description ?? "Your searches with Mkan"}</SheetDescription>

        {viewTitle ? (
          <div className="flex h-14 shrink-0 items-center gap-1 px-1.5">
            <button type="button" onClick={() => setView("chats")} aria-label={s?.back ?? "Back"} title={s?.back ?? "Back"} className={headerButton}>
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </button>
            <h2 className="text-[17px] font-semibold">{viewTitle}</h2>
          </div>
        ) : (
          <div className="flex h-16 shrink-0 items-center px-5 pt-2">
            <Link href={`/${locale}`} className="text-[28px] font-bold tracking-tight text-foreground">
              {a?.chat?.name ?? "Mkan"}
              <span className="sr-only"> — {a?.chat?.home ?? "Back to Mkan"}</span>
            </Link>
          </div>
        )}

        {view === "saved" && (
          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
            <SavedView />
          </div>
        )}
        {view === "memory" && (
          <div className="flex-1 overflow-y-auto overscroll-contain pb-4">
            <MemoryView memory={data?.memory ?? null} onChange={(memory) => setData((d) => (d ? { ...d, memory } : d))} />
          </div>
        )}

        <nav aria-label={s?.title ?? "Chats"} className={cn("flex-1 overflow-y-auto overscroll-contain px-2 pb-28", view !== "chats" && "hidden")}>
          {/* ChatGPT's Files · Images · Apps row: round grey tiles, a word under each. */}
          <ul className="grid list-none grid-cols-3 gap-2 border-b px-1 pb-5 pt-3">
            <Tile label={s?.tiles?.saved ?? "Saved"} onClick={() => setView("saved")} badge={savedIds.length > 0 ? String(savedIds.length) : undefined}>
              <Heart aria-hidden />
            </Tile>
            <Tile label={s?.tiles?.memory ?? "Memory"} onClick={() => setView("memory")} dot={remembered}>
              <Brain aria-hidden />
            </Tile>
            <Tile label={s?.tiles?.homes ?? "Homes"} href={`/${locale}/listings`}>
              <House aria-hidden />
            </Tile>
          </ul>
          {!data && !failed && (
            <ul aria-hidden className="space-y-2 px-3 pt-5">
              {[70, 55, 80, 45].map((w) => (
                <li key={w} className="h-4 animate-pulse rounded bg-muted" style={{ width: `${w}%` }} />
              ))}
            </ul>
          )}
          {failed && !data && (
            <p className="px-3 pt-5 text-sm text-muted-foreground">
              {s?.error ?? "Couldn't load your chats."}{" "}
              <button type="button" onClick={() => setReloads((n) => n + 1)} className="font-medium text-foreground underline underline-offset-4">
                {s?.retry ?? "Try again"}
              </button>
            </p>
          )}
          {data && data.chats.length === 0 && (
            <p className="px-3 pt-5 text-sm text-muted-foreground">{s?.empty ?? "No chats yet. Describe the home you need, and your search will be kept here."}</p>
          )}

          {groups.map(({ group, rows }) => (
            <section key={group} className="pt-6">
              <h3 className="px-3 pb-2 text-[17px] font-semibold text-foreground">{groupLabel?.[group] ?? group}</h3>
              <ul className="list-none">
                {rows.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    title={chatTitle(chat, a, locale, money)}
                    active={chat.id === activeId}
                    onOpen={() => onOpenChat(chat.id)}
                    onDelete={() => void remove(chat.id)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {data?.next && (
            <button
              type="button"
              onClick={() => void loadMore(data.next!)}
              disabled={more}
              className="mx-3 mt-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {more && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {s?.more ?? "Show more"}
            </button>
          )}
        </nav>

        {view === "chats" && (
          <div className="pointer-events-none relative h-0 shrink-0">
            <button
              type="button"
              onClick={onNewChat}
              className="pointer-events-auto absolute bottom-5 end-5 flex h-14 items-center gap-2.5 rounded-full bg-foreground px-6 text-[17px] font-medium text-background shadow-[0_6px_20px_rgba(0,0,0,0.25)] transition-transform active:scale-95"
            >
              <SquarePen className="size-[22px]" aria-hidden />
              {s?.chat ?? "Chat"}
              <span className="sr-only"> — {a?.chat?.newChat ?? "New chat"}</span>
            </button>
          </div>
        )}

        {data && !data.signedIn && view === "chats" && (
          <p className="shrink-0 border-t px-5 py-4 pb-[max(env(safe-area-inset-bottom),16px)] text-xs leading-5 text-muted-foreground">
            {s?.deviceOnly ?? "Chats stay on this device."}{" "}
            <Link
              href={`/${locale}/login?callbackUrl=${encodeURIComponent(`/${locale}/find`)}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {s?.signIn ?? "Sign in to keep them on every device"}
            </Link>
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Tile({ label, onClick, href, badge, dot, children }: { label: string; onClick?: () => void; href?: string; badge?: string; dot?: boolean; children: React.ReactNode }) {
  const body = (
    <>
      <span className="relative flex size-16 items-center justify-center rounded-full bg-muted text-foreground transition-colors group-hover:bg-muted/70 [&_svg]:size-6">
        {children}
        {badge && <span className="absolute -end-0.5 -top-0.5 min-w-5 rounded-full bg-foreground px-1.5 text-center text-[11px] font-medium leading-5 text-background tabular-nums">{badge}</span>}
        {dot && <span className="absolute end-1 top-1 size-2.5 rounded-full border-2 border-background bg-emerald-500" aria-hidden />}
      </span>
      <span className="text-[13px] font-medium text-foreground">{label}</span>
    </>
  );
  const cls = "group flex w-full flex-col items-center gap-2";
  return <li>{href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>}</li>;
}

async function fetchChats(before?: string): Promise<AgentChatsView | null> {
  const res = await fetch(`/api/agent/chats${before ? `?before=${encodeURIComponent(before)}` : ""}`, { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as AgentChatsView) : null;
}

function ChatRow({ chat, title, active, onOpen, onDelete }: { chat: AgentChatRow; title: string; active: boolean; onOpen: () => void; onDelete: () => void }) {
  const s = useDictionary()?.agent?.chats;
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <li className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm">{s?.deleteConfirm ?? "Delete this chat?"}</span>
        <button type="button" onClick={onDelete} className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white">
          {s?.delete ?? "Delete"}
        </button>
        <button type="button" autoFocus onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 text-xs font-medium hover:bg-background">
          {s?.cancel ?? "Cancel"}
        </button>
      </li>
    );
  }

  return (
    <li className={cn("group flex items-center rounded-xl transition-colors", active ? "bg-muted" : "hover:bg-muted/60")}>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 py-3 ps-3 text-start text-[17px] text-foreground"
      >
        <span dir="auto" className="truncate">
          {title}
        </span>
        {chat.status === "WAITING" ? (
          <span className="size-2 shrink-0 rounded-full bg-amber-500" role="img" aria-label={s?.waiting ?? "Waiting on a broker"} />
        ) : chat.confirmed ? (
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" role="img" aria-label={s?.confirmed ?? "A broker confirmed a home"} />
        ) : null}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={s?.options ?? "Chat options"}
        title={s?.options ?? "Chat options"}
        className="me-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-opacity hover:bg-background hover:text-foreground md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
    </li>
  );
}
