import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const data = [
  { time: "00:00", series1: 31, series2: 11 },
  { time: "01:30", series1: 40, series2: 32 },
  { time: "02:30", series1: 28, series2: 45 },
  { time: "03:30", series1: 51, series2: 32 },
  { time: "04:30", series1: 42, series2: 34 },
  { time: "05:30", series1: 109, series2: 52 },
  { time: "06:30", series1: 100, series2: 41 },
];

export function RevenueChart() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Revenue Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorSeries1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSeries2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="time" 
              stroke="hsl(var(--foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--foreground))"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "var(--radius)",
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="series1"
              stroke="hsl(var(--chart-1))"
              fillOpacity={1}
              fill="url(#colorSeries1)"
              name="Revenue"
            />
            <Area
              type="monotone"
              dataKey="series2"
              stroke="hsl(var(--chart-2))"
              fillOpacity={1}
              fill="url(#colorSeries2)"
              name="Profit"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

