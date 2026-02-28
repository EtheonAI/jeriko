import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TextInsightCardProps {
  category: string;
  title: string;
  description: string;
}

export function TextInsightCard({ category, title, description }: TextInsightCardProps) {
  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary" className="w-fit mb-2">
          {category}
        </Badge>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

