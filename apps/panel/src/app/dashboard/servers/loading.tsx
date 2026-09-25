import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for the "My servers" table page. */
export default function ServersLoading() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-36" rounded="sm" />
      </div>

      <div className="panel-card p-4">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4 py-1.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-16" rounded="full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
