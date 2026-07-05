"use client";
import { cdn } from "@/lib/cdn";

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { Badge } from '@/components/ui/badge';
import Footer from '@/components/site/footer';
import { AttentionCard } from '@/components/hosting/attention-card';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatDate } from '@/lib/i18n/formatters';
import type { Locale } from '@/components/internationalization/config';

export interface HostReservation {
  id: number;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  totalPrice: number;
  listingTitle: string;
  listingPhoto: string | null;
  guestName: string;
  guestImage: string | null;
}

export interface HostingAttention {
  /** Remaining required-to-publish steps across the host's drafts. */
  count: number;
  /** Cover photo of up to two drafts (null → placeholder tile). */
  photos: (string | null)[];
}

// Airbnb DLS "material" pill (ref: hosting Today/Upcoming tablist, exact
// computed tokens) — selected renders in the dark scheme, unselected in the
// light one. Kept as inline styles: backdrop-filter/rgba combos are exactly
// the values Turbopack's arbitrary-class scan tends to drop in dev.
const PILL_MATERIAL: Record<'selected' | 'unselected', React.CSSProperties> = {
  selected: {
    backgroundColor: 'rgba(32,32,32,0.86)',
    color: '#FFFFFF',
    backdropFilter: 'blur(22px) saturate(6)',
    WebkitBackdropFilter: 'blur(22px) saturate(6)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.06)',
  },
  unselected: {
    backgroundColor: 'rgba(240,240,240,0.86)',
    color: '#000000',
    backdropFilter: 'blur(12px) saturate(3)',
    WebkitBackdropFilter: 'blur(12px) saturate(3)',
  },
};

export default function HostingContent({
  reservations = [],
  attention = null,
}: {
  reservations?: HostReservation[];
  attention?: HostingAttention | null;
}) {
  const dict = useDictionary();
  const params = useParams();
  const lang = (params?.lang as Locale) ?? 'ar';
  const { session, status } = useAuthRedirect();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming'>('today');

  // Show loading while checking session
  if (status === 'loading') {
    return <Loading variant="fullscreen" text={dict.common?.loading ?? "Loading..."} />;
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  const t = dict.hosting?.content;

  // "Today" = guests arriving, staying, or departing today; "Upcoming"
  // = stays that start after today.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayReservations = reservations.filter(
    (r) => new Date(r.checkIn) <= endOfToday,
  );
  const upcomingReservations = reservations.filter(
    (r) => new Date(r.checkIn) > endOfToday,
  );
  const visible = activeTab === 'today' ? todayReservations : upcomingReservations;

  const tabs = [
    { key: 'today' as const, label: t?.today ?? 'Today' },
    { key: 'upcoming' as const, label: t?.upcoming ?? 'Upcoming' },
  ];

  return (
    <>
      {/* Mobile tabs — Airbnb material pills floating over the content on a
          sticky, hit-through strip (ref: sticky top-0 z-100 pointer-events
          none; tablist py-16 gap-12; pills h-40 px-20 radius-full 14/18
          medium). The material blur/shadow values live in PILL_MATERIAL. */}
      <div className="pointer-events-none sticky top-0 z-40 lg:hidden">
        <div role="tablist" className="flex items-center justify-center gap-3 py-4">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className="pointer-events-auto inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200"
              style={PILL_MATERIAL[activeTab === key ? 'selected' : 'unselected']}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content — fills the viewport on mobile so the site footer only
          appears once you scroll (ref behaviour). */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 lg:py-8 min-h-svh lg:min-h-0">
        {/* Desktop toggle chips — unchanged compact 32px design (≥lg only;
            mobile uses the material pills above). */}
        <div className="hidden lg:flex justify-center items-center space-x-4 mb-8 lg:mb-16">
          <button
            onClick={() => setActiveTab('today')}
            className={`inline-flex items-center justify-center rounded-full border px-4 py-2 min-h-[32px] text-sm font-medium transition-all ${
              activeTab === 'today'
                ? 'bg-[#222222] text-white border-[#222222]'
                : 'bg-white text-[#222222] border-[#DDDDDD] hover:border-[#222222]'
            }`}
          >
            {t?.today ?? "Today"}
            {todayReservations.length > 0 ? ` (${todayReservations.length})` : ''}
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`inline-flex items-center justify-center rounded-full border px-4 py-2 min-h-[32px] text-sm font-medium transition-all ${
              activeTab === 'upcoming'
                ? 'bg-[#222222] text-white border-[#222222]'
                : 'bg-white text-[#222222] border-[#DDDDDD] hover:border-[#222222]'
            }`}
          >
            {t?.upcoming ?? "Upcoming"}
            {upcomingReservations.length > 0 ? ` (${upcomingReservations.length})` : ''}
          </button>
        </div>

        {visible.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((r) => (
              <div key={r.id} className="border rounded-xl overflow-hidden bg-card">
                <div className="relative h-36 bg-muted">
                  {r.listingPhoto ? (
                    <Image
                      src={r.listingPhoto}
                      alt={r.listingTitle}
                      fill
                      className="object-cover"
                    />
                  ) : null}
                  <Badge
                    variant={r.status === 'Confirmed' ? 'default' : 'secondary'}
                    className="absolute top-2 start-2"
                  >
                    {r.status === 'Confirmed'
                      ? (t?.statusConfirmed ?? 'Confirmed')
                      : (t?.statusPending ?? 'Pending')}
                  </Badge>
                </div>
                <div className="p-4 space-y-1">
                  <p className="font-medium truncate">{r.listingTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.guestName} · {r.guestCount} {t?.guestsSuffix ?? 'guests'}
                  </p>
                  <p className="text-sm text-muted-foreground" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                    {formatDate(new Date(r.checkIn), lang)} → {formatDate(new Date(r.checkOut), lang)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center pt-2 sm:pt-6">
            {/* Reference: 220×166 (native 4:3 booking illustration), not a
                letterboxed square. Desktop keeps its 200px box. */}
            <Image
              src={cdn.product("hosting/today.png")}
              alt={t?.todayIllustration ?? "Today illustration"}
              width={220}
              height={166}
              priority
              className="h-auto w-[220px] object-contain sm:h-[200px] sm:w-[200px]"
            />
            {/* mobile heading uses the house Airbnb title scale
                (22/26, −0.44 tracking, #222); desktop stays 32px */}
            <h1 className="mt-2 max-w-xs text-center text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222] sm:text-[32px] sm:leading-9 sm:tracking-normal">
              {activeTab === 'today'
                ? (t?.noReservations ?? 'You don\'t have any reservations')
                : (t?.noUpcomingReservations ?? 'You don\'t have any upcoming reservations')}
            </h1>
            <p className="mt-3 max-w-sm text-center text-sm text-muted-foreground sm:text-base">
              {t?.noReservationsSubtitle ?? "To get booked, you'll need to complete and publish your listing."}
            </p>
            {/* Reference secondary button: 48px tall, 12px radius, 16px label,
                14/24 padding, grey200 fill → grey300 hover (bg-muted equiv). */}
            <Link
              href={`/${lang}/hosting/listings`}
              className="mt-7 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-muted px-6 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              {t?.completeListing ?? 'Complete your listing'}
            </Link>
          </div>
        )}

        {visible.length > 0 && (
          <div className="mt-10 text-center">
            <Link href={`/${lang}/hosting/listings`} className="text-sm underline text-muted-foreground">
              {t?.manageListings ?? 'Manage your listings'}
            </Link>
          </div>
        )}

      </div>

      {/* Mobile hosting Today reuses the same site footer as the homepage and
          listings pages. Negative margins cancel the parent <main> px-4/sm:px-6
          gutters so the grey band goes full-bleed; desktop hosting keeps its own
          surface (footer hidden ≥ lg). */}
      <div className="-mx-4 mt-12 sm:-mx-6 lg:hidden">
        <Footer />
      </div>

      {/* "Actions need your attention" — fixed bottom sheet above the tab bar
          whenever drafts still miss required-to-publish steps (mobile only). */}
      {attention && attention.count > 0 ? (
        <AttentionCard count={attention.count} photos={attention.photos} />
      ) : null}
    </>
  );
}
