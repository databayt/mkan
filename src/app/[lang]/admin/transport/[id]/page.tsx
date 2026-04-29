import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { auth, isAdminOrSuper } from "@/lib/auth";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyOfficeButton } from "./verify-button";

export default async function AdminOfficeDetailPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const session = await auth();
  if (!isAdminOrSuper(session)) notFound();

  const officeId = Number(id);
  if (!Number.isInteger(officeId) || officeId <= 0) notFound();

  const office = await db.transportOffice.findUnique({
    where: { id: officeId },
    include: {
      owner: { select: { id: true, email: true, username: true } },
      assemblyPoint: { select: { name: true, nameAr: true } },
      _count: { select: { buses: true, routes: true, bookings: true } },
    },
  });
  if (!office) notFound();

  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase">{a.office ?? "Office"}</p>
          <h1 className="text-2xl font-semibold">{office.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={office.isActive ? "secondary" : "outline"}>
              {office.isActive
                ? a.officeActive ?? "Active"
                : a.officeInactive ?? "Inactive"}
            </Badge>
            <Badge variant={office.isVerified ? "default" : "outline"}>
              {office.isVerified
                ? a.officeVerified ?? "Verified"
                : a.officeUnverified ?? "Unverified"}
            </Badge>
            <span className="text-sm text-muted-foreground">#{office.id}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <VerifyOfficeButton
            officeId={office.id}
            isVerified={office.isVerified}
            labels={{
              verify: a.verifyOffice ?? "Verify office",
              unverify: a.unverifyOffice ?? "Unverify",
              verifying: a.verifying ?? "Saving...",
              verifiedToast: a.officeVerifiedToast ?? "Office marked verified",
              unverifiedToast: a.officeUnverifiedToast ?? "Verification removed",
              error: a.error ?? "Something went wrong",
            }}
          />
          <Link
            href={`/${lang}/transport/offices/${office.id}`}
            target="_blank"
            className="text-sm underline text-muted-foreground"
          >
            {a.viewPublic ?? "View public page"}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.owner ?? "Owner"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{office.owner.username ?? "—"}</div>
            <div className="text-muted-foreground">{office.owner.email}</div>
            <Link
              href={`/${lang}/admin/users?q=${encodeURIComponent(office.owner.email)}`}
              className="text-xs underline"
            >
              {a.findOwnerInUsers ?? "Find owner in users"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.contact ?? "Contact"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div>{office.email}</div>
            <div>{office.phone}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.statsTitle ?? "Stats"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-2xl font-semibold">{office._count.buses}</div>
              <div className="text-xs text-muted-foreground">{a.buses ?? "Buses"}</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{office._count.routes}</div>
              <div className="text-xs text-muted-foreground">{a.routes ?? "Routes"}</div>
            </div>
            <div>
              <div className="text-2xl font-semibold">{office._count.bookings}</div>
              <div className="text-xs text-muted-foreground">{a.bookings ?? "Bookings"}</div>
            </div>
          </CardContent>
        </Card>
        {office.assemblyPoint ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{a.assemblyPoint ?? "Assembly point"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {lang === "ar"
                ? office.assemblyPoint.nameAr ?? office.assemblyPoint.name
                : office.assemblyPoint.name}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {office.description ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{a.description ?? "Description"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-line">
              {lang === "ar" && office.descriptionAr ? office.descriptionAr : office.description}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
