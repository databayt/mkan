"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MoreHorizontal, SquarePen } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { deleteAgentChat } from "./actions";
import { groupChats } from "./chat-list";
import { chatTitle } from "./chips";
import { headerButton } from "./header";
import type { AgentChatRow, AgentChatsView } from "./types";

/**
 * The ☰ sheet — ChatGPT's sidebar on iOS. Mkan and New chat on top, then
 * this tenant's chats by day; a row opens its chat, ⋯ deletes it after an
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
  const money = useCallback((n: number) => formatCurrency(n, locale, "RWF"), [locale]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showClose={false}
        overlayClassName="z-[60]"
        className="z-[60] w-[85%] max-w-[320px] gap-0 p-0 sm:max-w-[320px]"
      >
        <SheetTitle className="sr-only">{s?.title ?? "Chats"}</SheetTitle>
        <SheetDescription className="sr-only">{s?.description ?? "Your searches with Mkan"}</SheetDescription>

        <div className="flex h-14 shrink-0 items-center justify-between gap-2 ps-2 pe-1.5">
          <Link href={`/${locale}`} className="rounded-full px-3 py-1.5 text-[17px] font-semibold text-foreground transition-colors hover:bg-muted">
            {a?.chat?.name ?? "Mkan"}
            <span className="sr-only"> — {a?.chat?.home ?? "Back to Mkan"}</span>
          </Link>
          <button type="button" onClick={onNewChat} aria-label={a?.chat?.newChat ?? "New chat"} title={a?.chat?.newChat ?? "New chat"} className={headerButton}>
            <SquarePen aria-hidden />
          </button>
        </div>

        <nav aria-label={s?.title ?? "Chats"} className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
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
            <section key={group} className="pt-4">
              <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{groupLabel?.[group] ?? group}</h3>
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

        {data && !data.signedIn && (
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
        className="flex min-w-0 flex-1 items-center gap-2 py-2.5 ps-3 text-start text-[15px] text-foreground"
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
