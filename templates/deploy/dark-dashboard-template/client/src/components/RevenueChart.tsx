import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { date: '09/19 00:00', series1: 31, series2: 11 },
  { date: '09/19 01:30', series1: 40, series2: 32 },
  { date: '09/19 02:30', series1: 28, series2: 45 },
  { date: '09/19 03:30', series1: 51, series2: 32 },
  { date: '09/19 04:30', series1: 42, series2: 34 },
  { date: '09/19 05:30', series1: 109, series2: 52 },
  { date: '09/19 06:30', series1: 100, series2: 41 },
];

export function RevenueChart() {
  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Revenue Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorSeries1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorSeries2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                color: 'hsl(var(--popover-foreground))',
              }}
            />
            <Area 
              type="monotone" 
              dataKey="series1" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#colorSeries1)" 
              strokeWidth={2}
            />
            <Area 
              type="monotone" 
              dataKey="series2" 
              stroke="hsl(var(--primary))" 
              fillOpacity={1} 
              fill="url(#colorSeries2)" 
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

