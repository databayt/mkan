import { ReportIssue } from "@/components/report-issue";
import { NOINDEX_METADATA } from "@/lib/metadata";

export const metadata = NOINDEX_METADATA;

const AuthLayout = ({
  children
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-[27rem]">
          {children}
        </div>
      </div>
      <div className="flex justify-center pb-6 text-sm text-muted-foreground">
        <ReportIssue />
      </div>
    </div>
  );
}

export default AuthLayout;
