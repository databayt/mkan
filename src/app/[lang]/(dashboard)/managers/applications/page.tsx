import ApplicationCard from "@/components/ApplicationCard";
import Header from "@/components/Header";
import { getManagerApplications } from "@/lib/actions/application-actions";
import { ApplicationTabs } from "@/components/application/tabs";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

// Force dynamic rendering to allow use of headers() in auth
export const dynamic = 'force-dynamic';

const Applications = async ({ params }: { params: Promise<{ lang: string }> }) => {
  const { lang } = await params;
  const d = await getDictionary(lang as Locale);
  const result = await getManagerApplications();
  const applications = result.applications || [];

  return (
    <div className="dashboard-container">
      <Header
        title={d.dashboard.applications.title}
        subtitle={d.dashboard.applications.subtitle}
      />
      <ApplicationTabs applications={applications} />
    </div>
  );
};

export default Applications;
