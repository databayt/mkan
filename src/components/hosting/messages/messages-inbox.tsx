"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ImagePlus,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
} from "lucide-react";
import type { Locale } from "@/components/internationalization/config";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { formatDate, formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import {
  sendMessage,
  markConversationRead,
  type ConversationListItem,
  type ConversationDetail,
  type ThreadMessage,
} from "@/lib/actions/message-actions";

interface MessagesDict {
  title?: string;
  all?: string;
  unread?: string;
  search?: string;
  writeMessage?: string;
  send?: string;
  back?: string;
  selectConversation?: string;
  selectHint?: string;
  noConversations?: string;
  noConversationsHint?: string;
  details?: string;
  reservation?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
  total?: string;
  viewListing?: string;
}

function shortDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
    day: "numeric",
    month: "short",
    calendar: "gregory",
  });
}
function msgTime(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleTimeString(locale === "ar" ? "ar" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MessagesInbox({
  conversations,
  selected,
  lang,
  dict,
}: {
  conversations: ConversationListItem[];
  selected: ConversationDetail | null;
  lang: Locale;
  dict: MessagesDict | null;
}) {
  const t = dict ?? {};
  const router = useRouter();
  const isRTL = lang === "ar";
  const isDesktop = useIsDesktop(1024);
  const BackArrow = isRTL ? ArrowRight : ArrowLeft;
  const DetailChevron = isRTL ? ChevronLeft : ChevronRight;

  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [messages, setMessages] = useState<ThreadMessage[]>(selected?.messages ?? []);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // reset thread-local state + mark read whenever the open conversation changes
  useEffect(() => {
    setMessages(selected?.messages ?? []);
    setShowDetails(false);
    setDraft("");
    if (selected?.id) markConversationRead(selected.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // keep the thread pinned to the latest message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, selected?.id]);

  const filtered = useMemo(
    () =>
      conversations.filter((c) => {
        if (filter === "unread" && !c.unread) return false;
        if (query) {
          const hay = `${c.guestName} ${c.lastMessage} ${c.listingTitle ?? ""}`.toLowerCase();
          if (!hay.includes(query.toLowerCase())) return false;
        }
        return true;
      }),
    [conversations, filter, query],
  );

  async function handleSend() {
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    const optimistic: ThreadMessage = {
      id: -Date.now(),
      body,
      senderId: "me",
      isHost: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    setDraft("");
    const res = await sendMessage({ conversationId: selected.id, body });
    setSending(false);
    if (res.ok) {
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? res.message : x)));
      router.refresh(); // refresh the left list (preview / order / unread)
    } else {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setDraft(body);
    }
  }

  return (
    <div
      className="-mx-4 flex border-t border-border sm:-mx-6 lg:-mx-8"
      style={{ height: "calc(100dvh - 8rem)" }}
    >
      {/* ---------------- inbox list ---------------- */}
      <aside
        className={`${!isDesktop && selected ? "hidden" : "flex"} w-full flex-col border-e border-border`}
        style={isDesktop ? { width: 400, flexShrink: 0 } : undefined}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-5 sm:px-6">
          <h1 className="text-xl font-semibold text-foreground">{t.title ?? "Messages"}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSearch((s) => !s)}
              aria-label={t.search ?? "Search"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <Search className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Filters"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <SlidersHorizontal className="size-4" />
            </button>
          </div>
        </div>

        {/* filter pills */}
        <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
            {t.all ?? "All"}
          </FilterPill>
          <FilterPill active={filter === "unread"} onClick={() => setFilter("unread")}>
            {t.unread ?? "Unread"}
          </FilterPill>
        </div>

        {showSearch && (
          <div className="px-4 pb-2 sm:px-6">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search ?? "Search"}
              dir="auto"
              className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground outline-none focus:border-foreground"
            />
          </div>
        )}

        {/* rows */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-3">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-foreground">{t.noConversations ?? "No messages yet"}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t.noConversationsHint ?? "Messages from guests will appear here."}
              </p>
            </div>
          ) : (
            filtered.map((c) => {
              const active = selected?.id === c.id;
              return (
                <Link
                  key={c.id}
                  href={`/${lang}/hosting/messages/${c.id}`}
                  className={`flex gap-3 rounded-2xl p-3 transition-colors ${active ? "bg-muted" : "hover:bg-muted/50"}`}
                >
                  <Avatar src={c.guestImage} name={c.guestName} size={48} unread={c.unread} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p
                        className={`truncate text-sm text-foreground ${c.unread ? "font-semibold" : "font-medium"}`}
                      >
                        {c.guestName}
                      </p>
                      <span className="flex-shrink-0 text-xs text-muted-foreground">
                        {shortDate(c.lastMessageAt, lang)}
                      </span>
                    </div>
                    <p
                      dir="auto"
                      className={`truncate text-sm ${c.unread ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {c.lastMessage}
                    </p>
                    {c.listingTitle && (
                      <p className="truncate text-xs text-muted-foreground">{c.listingTitle}</p>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      {/* ---------------- thread ---------------- */}
      <section className={`${!isDesktop && !selected ? "hidden" : "flex"} min-w-0 flex-1 flex-col`}>
        {selected ? (
          <>
            {/* header */}
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                {!isDesktop && (
                  <Link
                    href={`/${lang}/hosting/messages`}
                    aria-label={t.back ?? "Back"}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                  >
                    <BackArrow className="size-5" />
                  </Link>
                )}
                <Avatar src={selected.guestImage} name={selected.guestName} size={40} />
                <p className="truncate text-lg font-semibold text-foreground">{selected.guestName}</p>
                <button
                  type="button"
                  onClick={() => setShowDetails((s) => !s)}
                  aria-label={t.details ?? "Details"}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
                >
                  <DetailChevron className="size-4" />
                </button>
              </div>
            </div>

            {/* messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
              {selected.subject && (
                <p className="mx-auto mb-4 max-w-md text-center text-xs text-muted-foreground">
                  {selected.subject}
                </p>
              )}
              <MessageList messages={messages} selected={selected} lang={lang} />
            </div>

            {/* composer */}
            <div className="px-4 pb-5 pt-1 sm:px-8">
              <div className="flex items-end gap-2 rounded-2xl border border-border px-3 py-2 transition-colors focus-within:border-foreground">
                <button
                  type="button"
                  aria-label="Attach"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                >
                  <ImagePlus className="size-5" />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={1}
                  dir="auto"
                  placeholder={t.writeMessage ?? "Write a message…"}
                  className="max-h-32 min-h-[28px] flex-1 resize-none bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  aria-label={t.send ?? "Send"}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  <ArrowUp className="size-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <MessageSquare className="mb-3 size-10 text-muted-foreground/50" strokeWidth={1.5} />
            <p className="text-base font-medium text-foreground">
              {t.selectConversation ?? "Select a conversation"}
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              {t.selectHint ?? "Choose a message on the left to read and reply."}
            </p>
          </div>
        )}
      </section>

      {/* ---------------- details panel ---------------- */}
      {selected && showDetails && isDesktop && (
        <aside
          className="flex flex-col overflow-y-auto border-s border-border p-6"
          style={{ width: 320, flexShrink: 0 }}
        >
          <DetailsPanel selected={selected} lang={lang} t={t} />
        </aside>
      )}
    </div>
  );
}

// ---------------- message list ----------------
function MessageList({
  messages,
  selected,
  lang,
}: {
  messages: ThreadMessage[];
  selected: ConversationDetail;
  lang: Locale;
}) {
  let lastDay = "";
  return (
    <>
      {messages.map((m) => {
        const d = new Date(m.createdAt);
        const dayKey = d.toDateString();
        const showSep = dayKey !== lastDay;
        lastDay = dayKey;
        const incoming = !m.isHost; // guest message, from the host's point of view
        return (
          <React.Fragment key={m.id}>
            {showSep && (
              <div className="my-4 text-center text-xs text-muted-foreground">{formatDate(d, lang)}</div>
            )}
            <div className={`mb-2 flex items-end gap-2 ${incoming ? "justify-start" : "justify-end"}`}>
              {incoming && <Avatar src={selected.guestImage} name={selected.guestName} size={28} />}
              <div className={`flex max-w-[78%] flex-col gap-1 ${incoming ? "items-start" : "items-end"}`}>
                <div
                  dir="auto"
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                    incoming ? "bg-muted text-foreground" : "bg-foreground text-background"
                  }`}
                >
                  {m.body}
                </div>
                <span className="px-1 text-xs text-muted-foreground">{msgTime(m.createdAt, lang)}</span>
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </>
  );
}

// ---------------- details panel ----------------
function DetailsPanel({
  selected,
  lang,
  t,
}: {
  selected: ConversationDetail;
  lang: Locale;
  t: MessagesDict;
}) {
  return (
    <div className="space-y-5">
      {selected.listingTitle && (
        <Link href={`/${lang}/listings/${selected.listingId}`} className="block">
          <div className="relative mb-2 aspect-[3/2] w-full overflow-hidden rounded-xl bg-muted">
            {selected.listingPhoto && (
              <Image src={selected.listingPhoto} alt="" fill sizes="320px" className="object-cover" />
            )}
          </div>
          <p className="truncate text-sm font-medium text-foreground">{selected.listingTitle}</p>
          <p className="text-xs text-muted-foreground underline">{t.viewListing ?? "View listing"}</p>
        </Link>
      )}

      {selected.booking && (
        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-semibold text-foreground">{t.reservation ?? "Reservation"}</p>
          <dl className="space-y-2 text-sm">
            <DetailRow label={t.checkIn ?? "Check-in"} value={formatDate(new Date(selected.booking.checkIn), lang)} />
            <DetailRow label={t.checkOut ?? "Check-out"} value={formatDate(new Date(selected.booking.checkOut), lang)} />
            <DetailRow label={t.guests ?? "Guests"} value={formatNumber(selected.booking.guestCount, lang)} />
            <DetailRow label={t.total ?? "Total"} value={formatCurrency(selected.booking.totalPrice, lang)} />
          </dl>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}

// ---------------- small parts ----------------
function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-foreground text-background"
          : "border border-border text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Avatar({
  src,
  name,
  size,
  unread,
}: {
  src: string | null;
  name: string;
  size: number;
  unread?: boolean;
}) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="h-full w-full overflow-hidden rounded-full bg-muted">
        {src ? (
          <Image src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center font-semibold text-muted-foreground"
            style={{ fontSize: Math.round(size * 0.4) }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      {unread && (
        <span
          className="absolute end-0 top-0 h-2.5 w-2.5 rounded-full ring-2 ring-background"
          style={{ backgroundColor: "#FF385C" }}
        />
      )}
    </div>
  );
}
