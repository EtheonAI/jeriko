import { Card } from "@/components/ui/card";
import CountUp from "react-countup";

interface StatsCardProps {
  count: string;
  title: string;
}

export function StatsCard({ count, title }: StatsCardProps) {
  const getCountUpProps = (countString: string) => {
    const numericValue = parseFloat(countString.replace(/[^\d.]/g, ''));
    
    let suffix = '';
    if (countString.includes('+')) suffix = '+';
    if (countString.includes('K') || countString.includes('k')) suffix = 'K';
    if (countString.includes('M') || countString.includes('m')) suffix = 'M';
    
    return { end: numericValue, suffix };
  };

  const { end, suffix } = getCountUpProps(count);

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <h2 className="text-5xl font-bold text-gray-900">
        <CountUp
          start={0}
          end={end}
          duration={2}
          separator=","
          suffix={suffix}
          enableScrollSpy
          scrollSpyOnce
        />
      </h2>
      <h3 className="mt-1 text-lg font-medium text-gray-900">
        {title}
      </h3>
    </Card>
  );
}

export default StatsCard;

