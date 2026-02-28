import { Button } from "@/components/ui/button";
import { Download, Filter } from "lucide-react";

interface PageHeaderProps {
  title: string;
  withActions?: boolean;
}

export function PageHeader({ title, withActions = false }: PageHeaderProps) {
  return (
    <div className="flex justify-between items-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      {withActions && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      )}
    </div>
  );
}

