import { TableSkeleton } from "@/components/atom/skeletons";

// Navbar + sidebar come from (dashboard)/layout.tsx — ghost the content only.
export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-8">
      <TableSkeleton />
    </div>
  );
}
