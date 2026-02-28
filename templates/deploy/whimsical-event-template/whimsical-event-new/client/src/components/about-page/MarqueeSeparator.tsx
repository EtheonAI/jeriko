import Marquee from "react-fast-marquee";
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface MarqueeSeparatorProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function MarqueeSeparator({ theme }: MarqueeSeparatorProps) {
  const marqueeItems = [
    "LIVE MUSIC",
    "STREET FOOD", 
    "FESTIVAL VIBES",
    "DJ SETS",
    "BROOKLYN ENERGY",
    "ART INSTALLATIONS",
    "CRAFT DRINKS",
    "DANCE FLOORS"
  ];

  return (
    <div className={`py-2 bg-gradient-to-r ${theme.gradient} overflow-hidden`}>
      <Marquee 
        speed={50} 
        gradient={false}
        className="text-white font-['Ranchers'] text-lg md:text-xl font-bold"
      >
        {marqueeItems.flatMap((item, index) => [
          <span key={`text-${index}`} className="whitespace-nowrap drop-shadow-lg mx-4">
            {item}
          </span>,
          <div key={`lottie-${index}`} className="flex items-center justify-center mx-3">
            <DotLottieReact
              src="/shine-white.lottie"
              loop
              autoplay
              className="w-6 h-6"
            />
          </div>
        ])}
      </Marquee>
    </div>
  );
}

export default MarqueeSeparator;

