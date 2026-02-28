import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFetchData } from "@/hooks/useFetchData";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

interface SalesData {
  id: number;
  source: string;
  revenue: string;
  value: number;
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--primary) / 0.7)',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--primary) / 0.3)',
];

export function SalesChart() {
  const { data: salesData, loading, error } = useFetchData<SalesData[]>('/mocks/Sales.json');
  
  const topSales = salesData?.slice(0, 4) || [];
  const chartData = topSales.map(item => ({
    name: item.source,
    value: item.value,
  }));

  const total = topSales.reduce((sum, item) => sum + item.value, 0);

  return (
    <Card className="border-border/40">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Sales Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading chart...</p>
          </div>
        ) : error ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-destructive">Error loading sales data</p>
          </div>
        ) : topSales.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={0}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <text
                  x="50%"
                  y="50%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground text-2xl font-semibold"
                >
                  {(total / 1000).toFixed(3)}
                </text>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.source}</TableCell>
                      <TableCell>{sale.revenue}</TableCell>
                      <TableCell className="text-right">{sale.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No data available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

