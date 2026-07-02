import { addDays } from 'date-fns';

import {
  getTransportOffice,
  getOfficeTrips,
} from '@/lib/actions/transport-actions';
import { getDictionary } from '@/components/internationalization/dictionaries';
import type { Locale } from '@/components/internationalization/config';
import { OfficeContent } from './content';

interface OfficePageProps {
  params: Promise<{ lang: Locale; id: string }>;
}

export default async function OfficeDetailsPage({ params }: OfficePageProps) {
  const { lang, id } = await params;
  const officeId = Number(id);

  const [dictionary, office, trips] = await Promise.all([
    getDictionary(lang),
    Number.isFinite(officeId) ? getTransportOffice(officeId) : null,
    Number.isFinite(officeId)
      ? getOfficeTrips(officeId, new Date(), addDays(new Date(), 7))
      : [],
  ]);

  return (
    <OfficeContent
      office={office}
      trips={trips ?? []}
      lang={lang}
      dictionary={dictionary}
    />
  );
}
