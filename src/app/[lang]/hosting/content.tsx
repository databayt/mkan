"use client";
import { cdn } from "@/lib/cdn";

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { Badge } from '@/components/ui/badge';
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

  return (
    <>
      {/* Main Content */}
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
    </>
  );
}
