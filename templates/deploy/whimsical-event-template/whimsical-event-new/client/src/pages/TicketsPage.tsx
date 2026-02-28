import HeroSection from '../components/tickets-page/HeroSection';
import PricingSection from '../components/tickets-page/PricingSection';
import MarqueeSeparator from '../components/about-page/MarqueeSeparator';

interface TicketsContentProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function TicketsContent({ theme }: TicketsContentProps) {
  return (
    <div className="space-y-0">
      <HeroSection theme={theme} />
      <MarqueeSeparator theme={theme} />
      <PricingSection theme={theme} />
    </div>
  );
}

export default TicketsContent;

