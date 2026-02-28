import { Card, CardContent } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Receipt, Coins, Tag, User } from "lucide-react";

interface StatsCardProps {
  data: {
    title: string;
    icon: string;
    value: string;
    diff?: number;
    period?: string;
    comparedTo?: string;
  };
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  receipt: Receipt,
  coin: Coins,
  discount: Tag,
  user: User,
};

export function StatsCard({ data }: StatsCardProps) {
  const Icon = iconMap[data.icon] || Receipt;
  const hasDiff = typeof data.diff === 'number';
  const isPositive = hasDiff && (data.diff ?? 0) > 0;
  const isNegative = hasDiff && (data.diff ?? 0) < 0;

  return (
    <Card className="border-border/40">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{data.title}</p>
            <h3 className="text-3xl font-bold text-foreground mb-2">{data.value}</h3>
            {hasDiff && (
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1 text-sm font-medium ${
                  isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                  {isPositive && <ArrowUp className="h-4 w-4" />}
                  {isNegative && <ArrowDown className="h-4 w-4" />}
                  <span>{Math.abs(data.diff ?? 0)}%</span>
                </div>
                {data.comparedTo && (
                  <span className="text-xs text-muted-foreground uppercase">
                    {data.comparedTo}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

