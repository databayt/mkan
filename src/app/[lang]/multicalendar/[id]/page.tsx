import { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { getMulticalendar } from "@/lib/actions/calendar-actions";
import Multicalendar from "@/components/hosting/calendar/multicalendar";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return createMetadata({
    title: dict?.hosting?.multicalendar?.title ?? "Calendar",
    description: dict?.hosting?.multicalendar?.subtitle ?? "Manage availability and pricing",
    locale: lang,
    path: "/multicalendar",
  });
}

export default async function MulticalendarPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/${lang}/login`);

  const focusId = Number(id);
  const now = new Date();
  // One month at a time: the grid refetches per-month navigation client-side.
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const data = await getMulticalendar({
    start,
    end,
    focusId: Number.isFinite(focusId) ? focusId : undefined,
  });

  // No listings yet → bounce to listings to create one.
  if (data.listings.length === 0) redirect(`/${lang}/hosting/listings`);

  const dict = await getDictionary(lang as Locale);

  return (
    <Multicalendar
      data={data}
      lang={lang as Locale}
      dict={dict?.hosting?.multicalendar ?? null}
      monthStartISO={start.toISOString()}
    />
  );
}
