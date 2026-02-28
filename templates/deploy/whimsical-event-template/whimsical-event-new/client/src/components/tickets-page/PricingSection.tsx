import { Button } from '../ui/button';
import BadgePill from '../ui/badge-pill';

interface PricingSectionProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function PricingSection({ theme }: PricingSectionProps) {
  return (
    <div className="h-full flex flex-col justify-center max-w-5xl mx-auto py-16 px-8">
      <div className="text-center mb-16">
        <BadgePill theme={theme} emoji="💰" text="PRICING" />
        <h2 className={`text-[64px] font-['Ranchers'] font-normal leading-none mb-8 ${theme.text}`}>
          CHOOSE YOUR<br />
          ADVENTURE
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
        <div className="bg-white rounded-3xl shadow-2xl p-10 hover:shadow-3xl transition-all duration-300 hover:scale-105 transform border-4 border-gray-100 relative flex flex-col">
          <h3 className="text-4xl font-['Ranchers'] text-gray-800 mb-6">🎠 General Admission</h3>
          <div className={`text-7xl font-['Ranchers'] ${theme.text} mb-6`}>$25</div>
          <ul className="space-y-4 text-gray-700 mb-8 text-lg flex-grow">
            <li className="flex items-center gap-3">🎪 Carnival entrance</li>
            <li className="flex items-center gap-3">🎯 Access to all games</li>
            <li className="flex items-center gap-3">🍿 Food court access</li>
            <li className="flex items-center gap-3">🎭 Live shows included</li>
          </ul>
          <Button className={`w-full ${theme.bg} hover:scale-105 transform transition-all duration-300 text-white py-4 rounded-2xl font-bold text-xl shadow-lg mt-auto`}>
            🎫 Buy General Pass
          </Button>
        </div>

        <div className={`bg-white rounded-3xl shadow-2xl p-10 border-4 border-gray-100 hover:shadow-3xl transition-all duration-300 hover:scale-105 transform relative overflow-hidden flex flex-col`}>
          <div className="absolute top-4 right-4">
            <span className={`${theme.bg} text-white px-4 py-2 rounded-full text-sm font-bold`}>
              🔥 POPULAR
            </span>
          </div>
          
          <h3 className="text-4xl font-['Ranchers'] text-gray-800 mb-6">🎢 All-Access Pass</h3>
          <div className={`text-7xl font-['Ranchers'] ${theme.text} mb-6`}>$65</div>
          <ul className="space-y-4 text-gray-700 mb-8 text-lg flex-grow">
            <li className="flex items-center gap-3">✅ Everything in General</li>
            <li className="flex items-center gap-3">🎠 Unlimited rides all day</li>
            <li className="flex items-center gap-3">🎯 $20 in game tokens</li>
            <li className="flex items-center gap-3">🍭 Free cotton candy</li>
            <li className="flex items-center gap-3">⚡ Skip-the-line privileges</li>
            <li className="flex items-center gap-3">🎁 Exclusive carnival souvenir</li>
          </ul>
          <Button className={`w-full ${theme.bg} hover:scale-105 transform transition-all duration-300 text-white py-4 rounded-2xl font-bold text-xl shadow-lg mt-auto`}>
            🎢 Buy All-Access Pass
          </Button>
        </div>
      </div>
    </div>
  );
}

export default PricingSection;

