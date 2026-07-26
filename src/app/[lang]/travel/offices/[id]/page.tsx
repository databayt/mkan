import type { Metadata } from 'next';
import { cache } from 'react';
import { addDays } from 'date-fns';

import {
  getTransportOffice,
  getOfficeTrips,
} from '@/lib/actions/travel-actions';
import { createMetadata, SITE_URL } from '@/lib/metadata';
import { JsonLd, transportOfficeJsonLd } from '@/components/seo/json-ld';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { OfficeContent } from './content';

interface OfficePageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

// React cache() dedupes across generateMetadata and the page body — the
// metadata block previously issued its own narrower findUnique for the same
// office row every request.
const fetchOffice = cache(async (officeId: number) =>
  getTransportOffice(officeId)
);

export async function generateMetadata({
  params,
}: OfficePageProps): Promise<Metadata> {
  const { lang, id } = await params;
  const d = await getDictionary(lang);
  const fallbackTitle = d.travel?.office?.title ?? 'Transport Office';
  const fallbackDescription =
    d.travel?.meta?.description ??
    'Book intercity bus trips with trusted transport offices.';
  const officeId = Number(id);
  if (!Number.isFinite(officeId)) {
    return createMetadata({
      title: fallbackTitle,
      description: fallbackDescription,
      locale: lang,
      path: `/travel/offices/${id}`,
      noIndex: true,
    });
  }
  const office = await fetchOffice(officeId).catch(() => null);
  const name = (lang === 'ar' ? office?.nameAr : office?.name) || office?.name;
  const description =
    (lang === 'ar' ? office?.descriptionAr : office?.description) ||
    office?.description;
  return createMetadata({
    title: name || fallbackTitle,
    description: description || fallbackDescription,
    locale: lang,
    path: `/travel/offices/${id}`,
    image: office?.logoUrl ?? undefined,
    noIndex: !office?.isActive,
  });
}

export default async function OfficeDetailsPage({ params }: OfficePageProps) {
  const { lang, id } = await params;
  const officeId = Number(id);

  const [dictionary, office, trips] = await Promise.all([
    getDictionary(lang),
    Number.isFinite(officeId) ? fetchOffice(officeId) : null,
    Number.isFinite(officeId)
      ? getOfficeTrips(officeId, new Date(), addDays(new Date(), 7))
      : [],
  ]);

  return (
    <>
      {office && (
        <JsonLd
          data={transportOfficeJsonLd({
            name: (lang === 'ar' ? office.nameAr : office.name) || office.name,
            description:
              (lang === 'ar' ? office.descriptionAr : office.description) ||
              office.description,
            url: `${SITE_URL}/${lang}/travel/offices/${office.id}`,
            phone: office.phone,
            logoUrl: office.logoUrl,
            rating: office.rating,
            reviewCount: office.reviewCount,
          })}
        />
      )}
      <OfficeContent
        office={office}
        trips={trips ?? []}
        lang={lang}
        dictionary={dictionary}
      />
    </>
  );
}
