import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TextInsightCardProps {
  data: {
    id: number;
    category: string;
    title: string;
    description: string;
  };
}

export function TextInsightCard({ data }: TextInsightCardProps) {
  return (
    <Card className="border-border/40 hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary" className="text-xs">
            {data.category}
          </Badge>
        </div>
        <CardTitle className="text-lg">{data.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm text-muted-foreground">
          {data.description}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

