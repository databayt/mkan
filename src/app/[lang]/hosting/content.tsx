"use client";
import { cdn } from "@/lib/cdn";

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { Badge } from '@/components/ui/badge';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatDate, formatNumber } from '@/lib/i18n/formatters';
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

interface ContentDict {
  today?: string;
  upcoming?: string;
  welcome?: string;
  checkingOut?: string;
  currentlyHosting?: string;
  arrivingSoon?: string;
  pendingReview?: string;
  allReservations?: string;
  emptyCheckingOut?: string;
  emptyCurrentlyHosting?: string;
  emptyArrivingSoon?: string;
  emptyUpcoming?: string;
  emptyPendingReview?: string;
  statusConfirmed?: string;
  statusPending?: string;
  guestsSuffix?: string;
  noReservations?: string;
  noUpcomingReservations?: string;
  noReservationsSubtitle?: string;
  completeListing?: string;
  manageListings?: string;
  todayIllustration?: string;
}

/** midnight copy — never mutates the input (Prisma-date gotcha). */
function dayStart(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

type BucketKey = 'checkingOut' | 'currentlyHosting' | 'arrivingSoon' | 'upcoming' | 'pendingReview';

export default function HostingContent({
  reservations = [],
}: {
  reservations?: HostReservation[];
}) {
  const dict = useDictionary();
  const params = useParams();
  const lang = (params?.lang as Locale) ?? 'ar';
  const { session, status } = useAuthRedirect();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming'>('today');
  const [bucket, setBucket] = useState<BucketKey>('checkingOut');
  const [showAll, setShowAll] = useState(false);

  const t: ContentDict = dict.hosting?.content ?? {};

  // Airbnb "Today" reservation buckets (mobile chips): checkout/arrival within
  // today or tomorrow, stays spanning now, later check-ins, and past stays.
  const buckets = useMemo(() => {
    const today0 = dayStart(new Date());
    const dayAfterTomorrow = new Date(+today0 + 2 * 86400000);
    const out: Record<BucketKey, HostReservation[]> = {
      checkingOut: [],
      currentlyHosting: [],
      arrivingSoon: [],
      upcoming: [],
      pendingReview: [],
    };
    for (const r of reservations) {
      const ci = dayStart(new Date(r.checkIn));
      const co = dayStart(new Date(r.checkOut));
      if (+co >= +today0 && +co < +dayAfterTomorrow) out.checkingOut.push(r);
      if (+ci <= +today0 && +today0 < +co) out.currentlyHosting.push(r);
      if (+ci >= +today0 && +ci < +dayAfterTomorrow) out.arrivingSoon.push(r);
      if (+ci >= +dayAfterTomorrow) out.upcoming.push(r);
      if (+co < +today0) out.pendingReview.push(r);
    }
    return out;
  }, [reservations]);

  // Show loading while checking session
  if (status === 'loading') {
    return <Loading variant="fullscreen" text={dict.common?.loading ?? "Loading..."} />;
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  // "Today" = guests arriving, staying, or departing today; "Upcoming"
  // = stays that start after today. (desktop tabs)
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const todayReservations = reservations.filter(
    (r) => new Date(r.checkIn) <= endOfToday,
  );
  const upcomingReservations = reservations.filter(
    (r) => new Date(r.checkIn) > endOfToday,
  );
  const visible = activeTab === 'today' ? todayReservations : upcomingReservations;

  const firstName = (session.user?.name ?? session.user?.email ?? '')
    .split(/[@\s]/)[0];

  const CHIPS: { key: BucketKey; label: string; empty: string }[] = [
    { key: 'checkingOut', label: t.checkingOut ?? 'Checking out', empty: t.emptyCheckingOut ?? "You don’t have any guests checking out today or tomorrow." },
    { key: 'currentlyHosting', label: t.currentlyHosting ?? 'Currently hosting', empty: t.emptyCurrentlyHosting ?? "You aren’t hosting any guests right now." },
    { key: 'arrivingSoon', label: t.arrivingSoon ?? 'Arriving soon', empty: t.emptyArrivingSoon ?? "You don’t have any guests arriving today or tomorrow." },
    { key: 'upcoming', label: t.upcoming ?? 'Upcoming', empty: t.emptyUpcoming ?? "You don’t have any upcoming reservations." },
    { key: 'pendingReview', label: t.pendingReview ?? 'Pending review', empty: t.emptyPendingReview ?? "You don’t have any guest reviews to write." },
  ];
  const activeChip = CHIPS.find((c) => c.key === bucket)!;
  const bucketList = buckets[bucket];

  return (
    <>
      {/* ================= Mobile — airbnb host "Today" anatomy ============ */}
      <div className="pt-6 lg:hidden">
        <h1 className="text-[26px] font-semibold leading-8 text-foreground">
          {(t.welcome ?? 'Welcome, {name}!').replace('{name}', firstName)}
        </h1>

        {/* reservation-status chips (horizontal scroll) */}
        <div className="no-scrollbar -mx-4 mt-6 flex gap-2 overflow-x-auto px-4">
          {CHIPS.map(({ key, label }) => {
            const active = key === bucket;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setBucket(key)}
                className={`flex-shrink-0 whitespace-nowrap rounded-full border px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-border text-foreground hover:border-muted-foreground/40'
                }`}
              >
                {label} ({formatNumber(buckets[key].length, lang)})
              </button>
            );
          })}
        </div>

        {/* selected bucket */}
        <div className="mt-6">
          {bucketList.length === 0 ? (
            <div className="rounded-xl bg-muted px-8 py-12 text-center text-sm leading-5 text-muted-foreground">
              {activeChip.empty}
            </div>
          ) : (
            <div className="grid gap-4">
              {bucketList.map((r) => (
                <ReservationCard key={r.id} r={r} lang={lang} t={t} />
              ))}
            </div>
          )}
        </div>

        {/* all reservations */}
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          className="mt-8 flex items-center gap-1.5 text-base font-medium text-foreground underline underline-offset-2"
        >
          {t.allReservations ?? 'All reservations'} ({formatNumber(reservations.length, lang)})
          <ChevronDown className={`size-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
        </button>
        {showAll && (
          <div className="mt-4 grid gap-4 pb-4">
            {reservations.map((r) => (
              <ReservationCard key={r.id} r={r} lang={lang} t={t} />
            ))}
          </div>
        )}
      </div>

      {/* ================= Desktop — unchanged ============================= */}
      <div className="hidden lg:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Toggle Buttons */}
          <div className="flex justify-center items-center space-x-4 mb-8 sm:mb-16">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-6 py-3 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all border min-h-[44px] sm:min-h-[32px] ${
                activeTab === 'today'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:text-gray-900 hover:border-gray-400'
              }`}
            >
              {t?.today ?? "Today"}
              {todayReservations.length > 0 ? ` (${todayReservations.length})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-6 py-3 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all border min-h-[44px] sm:min-h-[32px] ${
                activeTab === 'upcoming'
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:text-gray-900 hover:border-gray-400'
              }`}
            >
              {t?.upcoming ?? "Upcoming"}
              {upcomingReservations.length > 0 ? ` (${upcomingReservations.length})` : ''}
            </button>
          </div>

          {visible.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => (
                <ReservationCard key={r.id} r={r} lang={lang} t={t} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center pt-2 sm:pt-6">
              <Image
                src={cdn.product("hosting/today.png")}
                alt={t?.todayIllustration ?? "Today illustration"}
                width={150}
                height={150}
                className="object-contain sm:w-[200px] sm:h-[200px]"
              />
              <h2 className="mt-2 max-w-xs text-center text-2xl font-semibold leading-tight text-foreground sm:text-[32px] sm:leading-9">
                {activeTab === 'today'
                  ? (t?.noReservations ?? 'You don\'t have any reservations')
                  : (t?.noUpcomingReservations ?? 'You don\'t have any upcoming reservations')}
              </h2>
              <p className="mt-3 max-w-sm text-center text-sm text-muted-foreground sm:text-base">
                {t?.noReservationsSubtitle ?? "To get booked, you'll need to complete and publish your listing."}
              </p>
              <Link
                href={`/${lang}/hosting/listings`}
                className="mt-7 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-muted px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
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
      </div>
    </>
  );
}

function ReservationCard({
  r,
  lang,
  t,
}: {
  r: HostReservation;
  lang: Locale;
  t: ContentDict;
}) {
  return (
    <div className="border rounded-xl overflow-hidden bg-card">
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
  );
}
