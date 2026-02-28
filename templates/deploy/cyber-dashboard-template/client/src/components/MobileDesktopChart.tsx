import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const data = [
  { name: "Jan", mobile: 44, desktop: 13 },
  { name: "Feb", mobile: 55, desktop: 23 },
  { name: "Mar", mobile: 41, desktop: 20 },
  { name: "Apr", mobile: 67, desktop: 8 },
  { name: "May", mobile: 22, desktop: 13 },
  { name: "Jun", mobile: 43, desktop: 27 },
  { name: "Jul", mobile: 34, desktop: 10 },
];

export function MobileDesktopChart() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Mobile vs Desktop Traffic</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
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
            <Bar dataKey="mobile" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="desktop" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

