import ApplicationCard from "@/components/ApplicationCard";
import Header from "@/components/Header";
import { getManagerApplications, type ApplicationWithDetails } from "@/components/application/action";
import { ApplicationTabs } from "@/components/application/tabs";

// Force dynamic rendering to allow use of headers() in auth
export const dynamic = 'force-dynamic';

const Applications = async ({ params }: { params: Promise<{ lang: string }> }) => {
  const { lang } = await params;
  const isAr = lang === "ar";
  const result = await getManagerApplications();

  if (!result.success) {
    return (
      <div className="dashboard-container">
        <Header
          title={isAr ? "الطلبات" : "Applications"}
          subtitle={isAr ? "عرض وإدارة طلبات عقاراتك" : "View and manage applications for your properties"}
        />
        <div className="mt-8 p-4 bg-red-100 border border-red-300 rounded-md">
          <p className="text-red-800">
            {result.error || (isAr ? "فشل تحميل الطلبات" : "Failed to load applications")}
          </p>
        </div>
      </div>
    );
  }

  const applications = result.data || [];

  return (
    <div className="dashboard-container">
      <Header
        title={isAr ? "الطلبات" : "Applications"}
        subtitle={isAr ? "عرض وإدارة طلبات عقاراتك" : "View and manage applications for your properties"}
      />
      <ApplicationTabs applications={applications} />
    </div>
  );
};

export default Applications;
