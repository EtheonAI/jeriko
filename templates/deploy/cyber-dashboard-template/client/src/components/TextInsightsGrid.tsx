import { useFetchData } from "@/hooks/useFetchData";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface TextInsight {
  id: number;
  category: string;
  title: string;
  description: string;
}

export function TextInsightsGrid() {
  const { data, loading, error } = useFetchData<TextInsight[]>("/mocks/TextInsights.json");

  const getOptimalColumns = (count: number) => {
    return Math.min(Math.max(count, 1), 4);
  };

  const optimalCols = loading ? 3 : getOptimalColumns(data?.length || 0);
  const gridCols = optimalCols === 1 ? "grid-cols-1" : 
                   optimalCols === 2 ? "grid-cols-1 md:grid-cols-2" :
                   optimalCols === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" :
                   "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";

  if (loading) {
    return (
      <div className={`grid ${gridCols} gap-4`}>
        {Array.from({ length: optimalCols }).map((_, i) => (
          <Skeleton key={i} className="h-[150px]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error loading insights data
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols} gap-4`}>
      {data?.map((insight) => (
        <Card key={insight.id} className="h-full">
          <CardHeader className="pb-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {insight.category}
            </p>
          </CardHeader>
          <CardContent>
            <h3 className="text-lg font-semibold mb-2">{insight.title}</h3>
            <p className="text-sm text-muted-foreground">{insight.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

