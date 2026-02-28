import { APP_LOGO, APP_TITLE } from "@/const";
import { PageHeader } from "@/components/PageHeader";
import { SalesChart } from "@/components/SalesChart";
import { MobileDesktopChart } from "@/components/MobileDesktopChart";
import { StatsGrid } from "@/components/StatsGrid";
import { TextInsightsGrid } from "@/components/TextInsightsGrid";
import { RevenueChart } from "@/components/RevenueChart";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b px-4 flex items-center h-16">
        <div className="flex items-center gap-2">
          <img
            src={APP_LOGO}
            className="h-8 w-8 rounded-lg border-border bg-background object-cover"
          />
          <span className="text-xl font-bold">{APP_TITLE}</span>
        </div>
      </header>
      <main className="flex-1 p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          <PageHeader title="Overview" withActions={true} />
          
          {/* Hero Chart Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SalesChart />
            <MobileDesktopChart />
          </div>

          {/* Stats Grid Section */}
          <StatsGrid />

          {/* Text Insights Section */}
          <TextInsightsGrid />

          {/* Revenue Chart Section */}
          <div className="grid grid-cols-1 gap-4">
            <RevenueChart />
          </div>
        </div>
      </main>
    </div>
  );
}
