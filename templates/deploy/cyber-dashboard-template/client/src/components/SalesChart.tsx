import { useFetchData } from "@/hooks/useFetchData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

interface SalesData {
  id: number;
  source: string;
  revenue: string;
  value: number;
}

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

export function SalesChart() {
  const { data, loading, error } = useFetchData<SalesData[]>("/mocks/Sales.json");

  const chartData = data?.slice(0, 4).map((item, index) => ({
    name: item.source,
    value: item.value,
    color: COLORS[index % COLORS.length],
  })) || [];

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Sales Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Error loading data</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Sales Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <div className="mt-4 text-center">
          <p className="text-2xl font-bold">{(total / 1000).toFixed(3)}</p>
          <p className="text-sm text-muted-foreground">Total</p>
        </div>
        <div className="mt-4 space-y-2">
          {data?.slice(0, 4).map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.source}</span>
              <span className="font-medium">{item.revenue}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

