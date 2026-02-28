import { useFetchData } from "@/hooks/useFetchData";
import { StatsCard } from "@/components/StatsCard";
import { Skeleton } from "@/components/ui/skeleton";

interface StatData {
  title: string;
  value: string;
  diff?: number;
  period?: string;
  comparedTo?: string;
}

interface StatsGridData {
  data: StatData[];
}

export function StatsGrid() {
  const { data, loading, error } = useFetchData<StatsGridData>("/mocks/StatsGrid.json");

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[150px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error loading stats data
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {data?.data?.map((stat, index) => (
        <StatsCard key={index} {...stat} />
      ))}
    </div>
  );
}

