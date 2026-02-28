import { Heart, Target, Zap, Bot } from 'lucide-react';

const AboutSection = () => {
  const stats = [
    {
      icon: <Target className="w-8 h-8 text-[#FF714B]" />,
      number: "2M+",
      label: "Young Adventurers"
    },
    {
      icon: <Zap className="w-8 h-8 text-[#C71E64]" />,
      number: "4",
      label: "Amazing Games"
    },
    {
      icon: <Heart className="w-8 h-8 text-[#4D2D8C]" />,
      number: "100%",
      label: "Kid-Safe"
    },
    {
      icon: <Bot className="w-8 h-8 text-[#FF714B]" />,
      number: "24/7",
      label: "Safety Monitoring"
    }
  ];

  const highlights = [
    {
      icon: "🛡️",
      text: "Every game is carefully designed with kid-friendly content and built-in safety features"
    },
    {
      icon: "🎨",
      text: "Creative adventures where kids can build worlds, design characters, and tell stories"
    },
    {
      icon: "🏆",
      text: "Learn while you play - solve puzzles, practice math, and discover science"
    },
    {
      icon: "👥",
      text: "Connect with other young gamers in supervised, safe multiplayer environments"
    }
  ];

  return (
    <section className="py-20 bg-[#F2F2F2] relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left side - About content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 bg-white border-4 border-black px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000]">
              <Heart className="w-5 h-5 text-[#C71E64]" />
              What Makes Us Special
            </div>
            
            <h2 className="text-5xl lg:text-6xl font-black">
              <span className="gradient-text">What Makes</span>
              <br />
              <span className="gradient-text">PixelPlay Special?</span>
            </h2>
            
            <p className="text-lg text-gray-700 leading-relaxed">
              At PixelPlay Kids, we believe gaming should be more than just fun - it should be 
              educational, safe, and inspiring. Our games are designed by child development experts 
              to create experiences that spark creativity and build real skills.
            </p>
            
            {/* Highlights */}
            <div className="space-y-4">
              {highlights.map((highlight, index) => (
                <div key={index} className="flex items-start gap-4">
                  <div className="w-3 h-3 bg-[#FF714B] border-2 border-black mt-2 flex-shrink-0"></div>
                  <p className="text-gray-700 font-medium">{highlight.text}</p>
                </div>
              ))}
            </div>
          </div>
          
          {/* Right side - Stats and emoji */}
          <div className="space-y-8">
            <div className="flex justify-center">
              <div className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] transition-all duration-200 hover:shadow-[12px_12px_0px_0px_#000000] hover:translate-x-[-2px] hover:translate-y-[-2px] w-32 h-32 bg-[#4D2D8C] flex items-center justify-center">
                <span className="text-6xl">🎮</span>
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-3xl font-black mb-2">Join the Adventure!</h3>
              <div className="w-16 h-1 bg-[#FF714B] mx-auto"></div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-6">
              {stats.map((stat, index) => (
                <div key={index} className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_#000000] transition-all duration-200 hover:shadow-[8px_8px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] text-center">
                  <div className="flex justify-center mb-4">
                    {stat.icon}
                  </div>
                  <div className="text-3xl font-black text-black mb-2">
                    {stat.number}
                  </div>
                  <div className="text-sm font-bold text-gray-700">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;

