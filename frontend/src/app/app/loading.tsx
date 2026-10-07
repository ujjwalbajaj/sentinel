import { Skeleton } from "@/components/ui/EmptyState";

export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28" />
      ))}
      <Skeleton className="h-64 md:col-span-2 xl:col-span-4" />
    </div>
  );
}
