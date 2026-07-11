import { TableSkeleton } from "@/components/atom/skeletons";

export default function TenantsLoading() {
  return (
    <div className="p-6 lg:p-8">
      <TableSkeleton />
    </div>
  );
}
