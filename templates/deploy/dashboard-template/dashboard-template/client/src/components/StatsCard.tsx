import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Receipt, Coins, Percent, User } from "lucide-react";

interface StatsCardProps {
  title: string;
  icon: string;
  value: string;
  diff?: number;
  comparedTo?: string;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  receipt: Receipt,
  coin: Coins,
  discount: Percent,
  user: User,
};

export function StatsCard({ title, icon, value, diff, comparedTo }: StatsCardProps) {
  const IconComponent = iconMap[icon] || Receipt;
  const hasDiff = typeof diff !== 'undefined';
  const isPositive = diff && diff > 0;
  const isNegative = diff && diff < 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hasDiff && (
          <div className="flex items-center gap-1 mt-1">
            {isPositive && (
              <>
                <ArrowUp className="h-3 w-3 text-green-600" />
                <span className="text-xs text-green-600 font-medium">{diff}%</span>
              </>
            )}
            {isNegative && (
              <>
                <ArrowDown className="h-3 w-3 text-red-600" />
                <span className="text-xs text-red-600 font-medium">{Math.abs(diff)}%</span>
              </>
            )}
            {comparedTo && (
              <span className="text-xs text-muted-foreground ml-1">{comparedTo}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

