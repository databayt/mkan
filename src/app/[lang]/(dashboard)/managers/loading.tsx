import { TableSkeleton } from "@/components/atom/skeletons";

export default function ManagersLoading() {
  return (
    <div className="p-6 lg:p-8">
      <TableSkeleton />
    </div>
  );
}
