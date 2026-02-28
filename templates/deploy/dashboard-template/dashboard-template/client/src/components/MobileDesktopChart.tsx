import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const data = [
  { month: 'Jan', mobile: 4000, desktop: 2400 },
  { month: 'Feb', mobile: 3000, desktop: 1398 },
  { month: 'Mar', mobile: 2000, desktop: 9800 },
  { month: 'Apr', mobile: 2780, desktop: 3908 },
  { month: 'May', mobile: 1890, desktop: 4800 },
  { month: 'Jun', mobile: 2390, desktop: 3800 },
];

export function MobileDesktopChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mobile vs Desktop</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey="month" 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <Bar dataKey="mobile" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="desktop" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

