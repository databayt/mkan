import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, MapPin, Phone, Mail, Calendar } from "lucide-react";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canOverride } from "@/lib/auth";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { formatDate } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";
import ApplicationActions from "./actions";

/**
 * Manager-facing application detail page. Gives the host all the context
 * needed to approve or reject an application in one glance — applicant
 * profile, property summary, message, and a set of explicit Approve /
 * Reject buttons that call `updateApplicationStatus` server-side.
 */

export default async function ManagerApplicationDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const applicationId = Number(id);
  if (!Number.isFinite(applicationId) || applicationId <= 0) notFound();

  const session = await auth();
  if (!session?.user?.id) notFound();

  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      listing: {
        include: {
          location: true,
        },
      },
      tenant: {
        include: {
          user: {
            select: { email: true, image: true, username: true },
          },
        },
      },
      lease: true,
    },
  });

  if (!application) notFound();

  // Ownership: only the listing's host or an admin may read this page.
  if (!canOverride(session, application.listing.hostId)) notFound();

  const dict = (await getDictionary(lang as "en" | "ar")) as unknown as Record<string, Record<string, string>>;
  const t = (dict.dashboard as Record<string, Record<string, string>> | undefined)?.applications ?? {};
  const currency = dict.common?.currency ?? "$";
  const cover = application.listing.photoUrls?.[0];

  const statusColor =
    application.status === "Approved"
      ? "bg-green-100 text-green-800"
      : application.status === "Denied"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href={`/${lang}/managers/applications`}
        className="inline-flex items-center text-sm text-muted-foreground hover:underline mb-6"
      >
        <ArrowLeft className="w-4 h-4 me-1 rtl:rotate-180" />
        {t.backToList ?? "Back to applications"}
      </Link>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {t.applicationFrom ?? "Application from"} {application.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(application.applicationDate, lang as Locale)}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
          {application.status}
        </span>
      </div>

      <div className="grid md:grid-cols-[1fr_320px] gap-8">
        <div className="space-y-6">
          {/* Applicant profile */}
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="text-lg font-medium">{t.applicant ?? "Applicant"}</h2>
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-muted-foreground" />
                {application.email}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                {application.phoneNumber}
              </div>
            </div>
          </section>

          {/* Message */}
          {application.message && (
            <section className="rounded-xl border p-4 space-y-2">
              <h2 className="text-lg font-medium">{t.message ?? "Message"}</h2>
              <p className="text-sm whitespace-pre-wrap">{application.message}</p>
            </section>
          )}

          {/* Lease status */}
          {application.lease && (
            <section className="rounded-xl border p-4 space-y-2 bg-muted/20">
              <h2 className="text-lg font-medium">{t.lease ?? "Lease created"}</h2>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                {formatDate(application.lease.startDate, lang as Locale)} →{" "}
                {formatDate(application.lease.endDate, lang as Locale)}
              </div>
              <div className="text-sm">
                {t.monthlyRent ?? "Monthly rent"}:{" "}
                <span className="font-medium">
                  {currency}
                  {application.lease.rent}
                </span>
              </div>
            </section>
          )}

          {/* Action buttons */}
          {application.status === "Pending" && (
            <ApplicationActions
              applicationId={application.id}
              lang={lang}
              dict={dict}
            />
          )}
        </div>

        {/* Property sidebar */}
        <aside className="rounded-xl border p-4 h-fit sticky top-24 space-y-3">
          {cover && (
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
              <Image
                src={cover}
                alt={application.listing.title ?? ""}
                fill
                sizes="320px"
                className="object-cover"
              />
            </div>
          )}
          <div>
            <Link
              href={`/${lang}/listings/${application.listing.id}`}
              className="text-sm font-medium hover:underline"
            >
              {application.listing.title}
            </Link>
            {application.listing.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <MapPin className="w-4 h-4" />
                {application.listing.location.city}, {application.listing.location.country}
              </div>
            )}
          </div>
          <div className="text-sm">
            {t.pricePerNight ?? "Price / night"}:{" "}
            <span className="font-medium">
              {currency}
              {application.listing.pricePerNight ?? 0}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
