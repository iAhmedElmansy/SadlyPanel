import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for the server detail area (header, tabs and content). */
export default function ServerDetailLoading() {
  return (
    <>
      <div className="mb-5">
        <Skeleton className="mb-3 h-3.5 w-24" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-5 w-16" rounded="full" />
            </div>
            <Skeleton className="h-3.5 w-80" />
          </div>
          <div className="flex gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 flex gap-1 border-b border-line">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="mb-2 h-5 w-16" />
        ))}
      </div>

      <div className="space-y-6">
        <Skeleton className="h-72 w-full" rounded="lg" />
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" rounded="lg" />
          ))}
        </div>
      </div>
    </>
  );
}
