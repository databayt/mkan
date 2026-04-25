import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import type { Locale } from '@/components/internationalization/config';

export const dynamic = 'force-dynamic';

interface CredentialsPageProps {
  params: Promise<{ lang: Locale }>;
}

/**
 * Dev-only credentials listing. Hidden in production.
 * Password for every seeded account is the value of DEMO_PASSWORD in
 * scripts/seed-transport.ts and scripts/seed-listings.ts (currently "123456").
 */
export default async function CredentialsPage({ params }: CredentialsPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const { lang } = await params;
  const isAr = lang === 'ar';

  const [offices, hostedListings, guests] = await Promise.all([
    db.transportOffice.findMany({
      where: { isActive: true },
      include: {
        owner: { select: { username: true, email: true } },
        assemblyPoint: { select: { city: true } },
      },
      orderBy: { name: 'asc' },
    }),
    // Group hosts by distinct ownerId so each host appears once
    db.user.findMany({
      where: {
        email: { endsWith: '@mkan.org' },
        listings: { some: {} },
      },
      select: {
        id: true,
        username: true,
        email: true,
        _count: { select: { listings: true } },
      },
      orderBy: { username: 'asc' },
    }),
    db.user.findMany({
      where: { username: { startsWith: 'traveler' } },
      select: { username: true, email: true },
      orderBy: { username: 'asc' },
    }),
  ]);

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          {isAr ? 'بيانات تجريبية' : 'Demo credentials'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? 'كلمة السر لجميع الحسابات:'
            : 'Every seeded account uses this password:'}{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono">123456</code>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {isAr
            ? 'هذه الصفحة ظاهرة في التطوير فقط. تعود 404 في الإنتاج. تسجيل الدخول يقبل اسم المستخدم أو البريد الإلكتروني.'
            : 'This page is development-only; production returns 404. Login accepts either the username or the email.'}
        </p>
      </header>

      {/* Transport offices */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">
          {isAr ? 'مكاتب النقل' : 'Transport offices'}{' '}
          <span className="text-sm text-muted-foreground">({offices.length})</span>
        </h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">{isAr ? 'المكتب' : 'Office'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'اسم المستخدم' : 'Username'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'البريد' : 'Email'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'المحطة' : 'Hub'}</th>
              </tr>
            </thead>
            <tbody>
              {offices.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.name}</div>
                    {o.nameAr && (
                      <div className="text-xs text-muted-foreground">{o.nameAr}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {o.owner.username ?? '—'}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <code className="font-mono text-xs">{o.owner.email}</code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.assemblyPoint?.city ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {offices.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {isAr ? 'لا توجد مكاتب محمّلة. شغّل' : 'No offices seeded yet. Run'}{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">pnpm seed:transport</code>
            {isAr ? ' لتعبئة البيانات.' : ' to populate.'}
          </p>
        )}
      </section>

      {/* Homes hosts */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-3">
          {isAr ? 'مضيفو المنازل' : 'Homes hosts'}{' '}
          <span className="text-sm text-muted-foreground">({hostedListings.length})</span>
        </h2>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">{isAr ? 'اسم المستخدم' : 'Username'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'البريد' : 'Email'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'عدد العقارات' : 'Listings'}</th>
              </tr>
            </thead>
            <tbody>
              {hostedListings.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {h.username ?? '—'}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <code className="font-mono text-xs">{h.email}</code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{h._count.listings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hostedListings.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {isAr ? 'لا يوجد مضيفون محمّلون. شغّل' : 'No hosts seeded yet. Run'}{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">pnpm seed:listings</code>
            {isAr ? ' لتعبئة البيانات.' : ' to populate.'}
          </p>
        )}
      </section>

      {/* Guest test accounts */}
      {guests.length > 0 && (
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">
            {isAr ? 'حسابات الضيوف (للاختبار)' : 'Guest test accounts'}{' '}
            <span className="text-sm text-muted-foreground">({guests.length})</span>
          </h2>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">{isAr ? 'اسم المستخدم' : 'Username'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'البريد' : 'Email'}</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.username} className="border-t">
                    <td className="px-4 py-3">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                        {g.username}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <code className="font-mono text-xs">{g.email}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Link
          href={`/${lang}/login`}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
        >
          {isAr ? 'تسجيل الدخول' : 'Go to login'}
        </Link>
        <Link
          href={`/${lang}/transport`}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
        >
          {isAr ? 'صفحة النقل' : 'Transport home'}
        </Link>
        <Link
          href={`/${lang}/listings`}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
        >
          {isAr ? 'صفحة المنازل' : 'Homes home'}
        </Link>
      </div>
    </main>
  );
}
