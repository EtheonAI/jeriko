import { useFetchData } from "@/hooks/useFetchData";
import { StatsCard } from "@/components/StatsCard";
import { RevenueChart } from "@/components/RevenueChart";
import { MobileDesktopChart } from "@/components/MobileDesktopChart";
import { SalesChart } from "@/components/SalesChart";
import { TextInsightCard } from "@/components/TextInsightCard";
import { Button } from "@/components/ui/button";
import { Download, Filter } from "lucide-react";

interface StatsData {
  data: Array<{
    title: string;
    icon: string;
    value: string;
    diff?: number;
    comparedTo?: string;
  }>;
}

interface TextInsight {
  id: number;
  category: string;
  title: string;
  description: string;
}

export default function Home() {
  const { data: statsData, loading: statsLoading } = useFetchData<StatsData>(
    "/mocks/StatsGrid.json",
    { data: [] }
  );

  const { data: textInsightsData, loading: textInsightsLoading } = useFetchData<TextInsight[]>(
    "/mocks/TextInsights.json",
    []
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-lg border bg-card animate-pulse" />
            ))}
          </>
        ) : (
          statsData.data.map((stat, index) => (
            <StatsCard
              key={index}
              title={stat.title}
              icon={stat.icon}
              value={stat.value}
              diff={stat.diff}
              comparedTo={stat.comparedTo}
            />
          ))
        )}
      </div>

      {/* Charts Section */}
      <div className="grid gap-4 grid-cols-1">
        <RevenueChart />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <MobileDesktopChart />
        </div>
        <div className="md:col-span-1">
          <SalesChart />
        </div>
      </div>

      {/* Text Insights Section */}
      <div>
        <h2 className="text-xl font-bold tracking-tight mb-4">Insights</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {textInsightsLoading ? (
            <>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 rounded-lg border bg-card animate-pulse" />
              ))}
            </>
          ) : (
            textInsightsData.map((insight) => (
              <TextInsightCard
                key={insight.id}
                category={insight.category}
                title={insight.title}
                description={insight.description}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

