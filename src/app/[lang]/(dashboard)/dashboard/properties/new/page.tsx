import { PropertyForm } from '@/components/forms/PropertyForm'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function NewPropertyPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${lang}/login`);
  }

  return (
    <div>
      <PropertyForm />
    </div>
  );
} 