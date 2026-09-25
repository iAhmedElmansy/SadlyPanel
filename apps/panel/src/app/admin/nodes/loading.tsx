import { Skeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Loading placeholder for the admin nodes page. */
export default function AdminNodesLoading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="panel-card flex items-start gap-3 p-4">
            <Skeleton className="size-9" rounded="lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </>
  );
}
