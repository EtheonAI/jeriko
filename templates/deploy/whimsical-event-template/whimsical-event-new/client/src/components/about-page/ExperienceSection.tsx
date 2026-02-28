import BadgePill from '../ui/badge-pill';

interface ExperienceSectionProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function ExperienceSection({ theme }: ExperienceSectionProps) {
  return (
    <div className="h-full flex flex-col justify-center max-w-5xl mx-auto py-16 px-8">
      <div className="text-center mb-16">
        <BadgePill theme={theme} emoji="✨" text="THE EXPERIENCE" />
        <h2 className={`text-[64px] font-['Ranchers'] font-normal leading-none mb-8 ${theme.text}`}>
          RIDES, GAMES,<br />
          AND TREATS
        </h2>
        <p className={`text-xl ${theme.text} mb-12 leading-relaxed max-w-3xl mx-auto`}>
          Food, fun, and lively energy come together to create an unforgettable carnival experience.
        </p>
      </div>

      <div className="flex justify-center items-center gap-8 mb-16">
        <div className={`${theme.bg} rounded-3xl p-8 text-white text-center transform -rotate-6 shadow-2xl w-80`}>
          <div className="text-6xl mb-4">✨</div>
          <h3 className="text-3xl font-['Ranchers'] font-bold mb-4">RIDES</h3>
          <p className="text-lg opacity-90">THRILLING RIDE EXPERIENCES</p>
        </div>
        
        <div className={`${theme.bg} rounded-3xl p-8 text-white text-center transform rotate-2 shadow-2xl w-80`}>
          <div className="text-6xl mb-4">✨</div>
          <h3 className="text-3xl font-['Ranchers'] font-bold mb-4">GAMES</h3>
          <p className="text-lg opacity-90">FUN AND EXCITING GAMES</p>
        </div>
        
        <div className={`${theme.bg} rounded-3xl p-8 text-white text-center transform -rotate-3 shadow-2xl w-80`}>
          <div className="text-6xl mb-4">✨</div>
          <h3 className="text-3xl font-['Ranchers'] font-bold mb-4">TREATS</h3>
          <p className="text-lg opacity-90">DELICIOUS TREATS AND SNACKS</p>
        </div>
      </div>
    </div>
  );
}

export default ExperienceSection;

