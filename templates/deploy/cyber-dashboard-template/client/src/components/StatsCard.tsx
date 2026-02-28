import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  diff?: number;
  period?: string;
  comparedTo?: string;
}

export function StatsCard({ title, value, diff, period, comparedTo }: StatsCardProps) {
  const DiffIcon = diff !== undefined && diff > 0 ? ArrowUpRight : ArrowDownRight;
  const diffColor = diff !== undefined && diff > 0 ? "text-green-600" : "text-red-600";

  return (
    <Card className="h-full">
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-6">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{title}</p>
          {period && (
            <Badge variant="secondary" className="text-xs">
              {period}
            </Badge>
          )}
        </div>
        <div className="flex items-end gap-2">
          <p className="text-3xl font-bold">{value}</p>
          {diff !== undefined && (
            <div className={`flex items-center ${diffColor} text-sm font-medium mb-1`}>
              <span>{diff}%</span>
              <DiffIcon className="w-4 h-4 ml-0.5" />
            </div>
          )}
        </div>
        {comparedTo && (
          <p className="text-xs text-muted-foreground mt-2">{comparedTo}</p>
        )}
      </CardContent>
    </Card>
  );
}

