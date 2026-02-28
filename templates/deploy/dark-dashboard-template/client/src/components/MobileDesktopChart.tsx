import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { month: 'Jan', mobile: 44, desktop: 13 },
  { month: 'Feb', mobile: 55, desktop: 23 },
  { month: 'Mar', mobile: 41, desktop: 20 },
  { month: 'Apr', mobile: 67, desktop: 8 },
  { month: 'May', mobile: 22, desktop: 13 },
  { month: 'Jun', mobile: 43, desktop: 27 },
  { month: 'Jul', mobile: 34, desktop: 10 },
];

export function MobileDesktopChart() {
  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Mobile vs Desktop Traffic</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis 
              dataKey="month" 
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
            <Legend 
              wrapperStyle={{
                color: 'hsl(var(--foreground))',
              }}
            />
            <Bar 
              dataKey="mobile" 
              fill="hsl(var(--primary))" 
              radius={[4, 4, 0, 0]}
              stackId="stack"
            />
            <Bar 
              dataKey="desktop" 
              fill="hsl(var(--primary) / 0.3)" 
              radius={[4, 4, 0, 0]}
              stackId="stack"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

