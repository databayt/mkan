"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CalendarCheck,
  ListChecks,
  Wallet,
  Bus,
  Route as RouteIcon,
  ArrowRight,
} from "lucide-react";
import { useTransportOffice } from "@/context/transport-office-context";
import { getOfficeDashboardStats } from "@/lib/actions/transport-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";

type Stats = Awaited<ReturnType<typeof getOfficeDashboardStats>>;

export default function TransportHostOverviewPage() {
  const params = useParams();
  const lang = (params.lang as string) ?? "ar";
  const officeId = Number(params.id);
  const { office } = useTransportOffice();
  const [stats, setStats] = useState<Stats | null>(null);
  const dict = useDictionary();
  const t = dict?.transportHost?.overview;
  const { locale } = useLocale();

  useEffect(() => {
    if (!officeId) return;
    getOfficeDashboardStats(officeId)
      .then(setStats)
      .catch(() => undefined);
  }, [officeId]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold mb-1">{office?.name ?? (t?.title ?? "Operator overview")}</h1>
        <p className="text-muted-foreground">{t?.subtitle ?? "Today's trips, recent bookings, and revenue."}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          icon={<CalendarCheck className="size-5" />}
          label={t?.upcomingTrips ?? "Upcoming trips"}
          value={stats?.upcomingTrips ?? "—"}
        />
        <KpiCard
          icon={<ListChecks className="size-5" />}
          label={t?.confirmedBookings ?? "Confirmed bookings"}
          value={stats?.confirmedBookings ?? "—"}
        />
        <KpiCard
          icon={<Wallet className="size-5" />}
          label={t?.totalRevenue ?? "Total revenue"}
          value={
            stats?.totalRevenue != null
              ? formatCurrency(stats.totalRevenue as number, locale)
              : "—"
          }
        />
        <KpiCard
          icon={<Bus className="size-5" />}
          label={t?.buses ?? "Buses"}
          value={stats?.totalBuses ?? "—"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickAction
          href={`/${lang}/transport-host/${officeId}/bookings`}
          icon={<ListChecks className="size-5" />}
          title={t?.bookingsTitle ?? "Bookings"}
          subtitle={t?.bookingsSubtitle ?? "Manage upcoming and past bookings"}
        />
        <QuickAction
          href={`/${lang}/transport-host/${officeId}/trips`}
          icon={<RouteIcon className="size-5" />}
          title={t?.tripsTitle ?? "Trips"}
          subtitle={t?.tripsSubtitle ?? "Schedule and run your trips"}
        />
        <QuickAction
          href={`/${lang}/transport-host/${officeId}/earnings`}
          icon={<Wallet className="size-5" />}
          title={t?.earningsTitle ?? "Earnings"}
          subtitle={t?.earningsSubtitle ?? "Revenue per route and per month"}
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold">{value ?? "—"}</div>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:bg-muted/30 transition-colors">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="text-muted-foreground mt-1">{icon}</div>
          <div className="flex-1">
            <div className="font-medium">{title}</div>
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <ArrowRight className="size-4 text-muted-foreground rtl:rotate-180" />
        </CardContent>
      </Card>
    </Link>
  );
}
