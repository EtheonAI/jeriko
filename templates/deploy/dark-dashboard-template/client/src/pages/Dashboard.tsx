import { MobileDesktopChart } from "@/components/MobileDesktopChart";
import { RevenueChart } from "@/components/RevenueChart";
import { SalesChart } from "@/components/SalesChart";
import { StatsCard } from "@/components/StatsCard";
import { TextInsightCard } from "@/components/TextInsightCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useFetchData } from "@/hooks/useFetchData";
import { Calendar, Download, Filter } from "lucide-react";

interface StatsData {
  data: Array<{
    title: string;
    icon: string;
    value: string;
    diff?: number;
    period?: string;
    comparedTo?: string;
  }>;
}

interface TextInsight {
  id: number;
  category: string;
  title: string;
  description: string;
}

export default function Dashboard() {
  const { data: statsData, loading: statsLoading, error: statsError } = 
    useFetchData<StatsData>('/mocks/StatsGrid.json');
  
  const { data: textInsightsData, loading: textInsightsLoading, error: textInsightsError } = 
    useFetchData<TextInsight[]>('/mocks/TextInsights.json');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="w-full border-b border-border/40 px-6 flex items-center h-16 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="flex items-center gap-3">
          <img
            src="/logo.webp"
            alt="Logo"
            className="h-8 w-8 rounded-lg border border-border/40 bg-background object-cover"
          />
          <span className="text-xl font-bold text-foreground">Analytics Dashboard</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground">Overview</h1>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Date Range
              </Button>
              <Button variant="default" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          {/* Stats and Mobile/Desktop Chart Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {statsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={`stats-loading-${i}`} className="h-[180px]" />
                ))
              ) : statsError ? (
                <div className="col-span-2 p-6 border border-destructive/50 rounded-lg bg-destructive/10">
                  <p className="text-sm text-destructive">Error loading stats</p>
                </div>
              ) : (
                statsData?.data?.map((stat) => (
                  <StatsCard key={stat.title} data={stat} />
                ))
              )}
            </div>

            {/* Mobile Desktop Chart */}
            <MobileDesktopChart />
          </div>

          {/* Revenue and Sales Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <RevenueChart />
            </div>
            <div>
              <SalesChart />
            </div>
          </div>

          {/* Text Insights Grid */}
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Insights</h2>
            {textInsightsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={`insight-loading-${i}`} className="h-[200px]" />
                ))}
              </div>
            ) : textInsightsError ? (
              <div className="p-6 border border-destructive/50 rounded-lg bg-destructive/10">
                <p className="text-sm text-destructive">Error loading insights</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {textInsightsData?.map((insight) => (
                  <TextInsightCard key={insight.id} data={insight} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-border/40 px-6 py-4 bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <p>© 2024 Analytics Dashboard. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

