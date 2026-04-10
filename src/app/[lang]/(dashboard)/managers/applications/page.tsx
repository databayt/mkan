import ApplicationCard from "@/components/ApplicationCard";
import Header from "@/components/Header";
import { getManagerApplications, type ApplicationWithDetails } from "@/components/application/action";
import { ApplicationTabs } from "@/components/application/tabs";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

// Force dynamic rendering to allow use of headers() in auth
export const dynamic = 'force-dynamic';

const Applications = async ({ params }: { params: Promise<{ lang: string }> }) => {
  const { lang } = await params;
  const d = await getDictionary(lang as Locale);
  const result = await getManagerApplications();

  if (!result.success) {
    return (
      <div className="dashboard-container">
        <Header
          title={d.dashboard.applications.title}
          subtitle={d.dashboard.applications.subtitle}
        />
        <div className="mt-8 p-4 bg-red-100 border border-red-300 rounded-md">
          <p className="text-red-800">
            {result.error || d.dashboard.tenantApplications.errorFetching}
          </p>
        </div>
      </div>
    );
  }

  const applications = result.data || [];

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
