import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for the admin "All servers" table page. */
export default function AdminServersLoading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="panel-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-48" rounded="sm" />
            <Skeleton className="h-9 w-28" rounded="sm" />
          </div>
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 py-1.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16" rounded="full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
