import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SkillCard, FeatureCard } from "./ui/brutalist-card";

const SkillsSection = () => {
  const [activeTab, setActiveTab] = useState("frontend");

  const tabs = [
    { id: "frontend", label: "🎨 Frontend", emoji: "🎨" },
    { id: "backend", label: "⚡ Backend", emoji: "⚡" },
    { id: "ai", label: "🤖 AI", emoji: "🤖" },
    { id: "devops", label: "🛠️ DevOps", emoji: "🛠️" },
  ];

  const goToPreviousTab = () => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const previousIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    setActiveTab(tabs[previousIndex].id);
  };

  const goToNextTab = () => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    const nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
    setActiveTab(tabs[nextIndex].id);
  };

  const skills: Record<
    string,
    Array<{
      icon: string;
      name: string;
      level: string;
      levelColor: string;
      description: string;
      stars: number;
    }>
  > = {
    frontend: [
      {
        icon: "⚛️",
        name: "React",
        level: "Expert",
        levelColor: "bg-[#e91e63]",
        description: "Component architecture & state management",
        stars: 5,
      },
      {
        icon: "▲",
        name: "Next.js",
        level: "Advanced",
        levelColor: "bg-[#00bcd4]",
        description: "Full-stack React framework mastery",
        stars: 4,
      },
      {
        icon: "🔷",
        name: "TypeScript",
        level: "Advanced",
        levelColor: "bg-[#00bcd4]",
        description: "Type-safe development practices",
        stars: 4,
      },
      {
        icon: "📜",
        name: "JavaScript (ES6+)",
        level: "Expert",
        levelColor: "bg-[#e91e63]",
        description: "Modern, clean, and maintainable code",
        stars: 5,
      },
      {
        icon: "🎨",
        name: "Tailwind CSS",
        level: "Expert",
        levelColor: "bg-[#e91e63]",
        description: "Utility-first styling approach",
        stars: 5,
      },
      {
        icon: "🌊",
        name: "Framer Motion",
        level: "Proficient",
        levelColor: "bg-[#2196f3]",
        description: "Smooth animations & interactions",
        stars: 3,
      },
    ],
  };

  const features = [
    {
      icon: "🚀",
      title: "Full-Stack Development",
      description: "MERN stack, Next.js, TypeScript",
    },
    {
      icon: "⏰",
      title: "Professional Experience",
      description: "Internships, freelance, and open-source work",
    },
    {
      icon: "💼",
      title: "Impactful Projects",
      description: "Platforms serving thousands of users",
    },
    {
      icon: "🤖",
      title: "Modern Tools",
      description: "Git, Docker, AWS, and modern development workflows",
    },
  ];

  return (
    <section id="skills" className="py-20 bg-[#faf9f6] relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute w-20 h-20 bg-[#ff9800] rounded-full border-4 border-black top-10 left-20 lg:z-auto -z-10"></div>
      <div className="absolute w-16 h-16 bg-[#9c27b0] rounded-full border-4 border-black bottom-10 right-10 lg:z-auto -z-10"></div>

      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16 px-2 py-2">
          <div className="inline-flex items-center gap-2 bg-white border-4 border-black rounded-full px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000] mb-8">
            <span className="text-2xl">😎</span>
            TECH SKILLS
          </div>

          <h2 className="text-5xl lg:text-7xl font-black mb-6">
            <span className="text-black">SKILLS </span>
            <span className="gradient-text">SHOWCASE</span>
          </h2>

          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Crafting beautiful, interactive user experiences
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-16 px-6 py-4">
          <div className="flex gap-1 sm:gap-2 bg-white border-4 border-black rounded-2xl p-1 sm:p-2 shadow-[6px_6px_0px_0px_#000000] max-w-full overflow-visible">
            <button
              onClick={goToPreviousTab}
              className="border-4 border-black rounded-2xl font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] p-2 sm:p-3 bg-white hover:bg-gray-50 flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Previous tab"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <div className="flex gap-1 sm:gap-2 overflow-x-auto scrollbar-hide flex-1 min-w-0 px-2 py-2 -mx-2 -my-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 sm:px-6 py-2 sm:py-3 rounded-xl font-bold transition-all duration-200 flex-shrink-0 min-w-[80px] sm:min-w-auto text-sm sm:text-base min-h-[44px] flex items-center justify-center ${
                    activeTab === tab.id
                      ? "bg-[#00bcd4] text-white border-4 border-black shadow-[4px_4px_0px_0px_#000000]"
                      : "bg-white text-gray-700 border-4 border-transparent hover:border-gray-300"
                  }`}
                >
                  <span className="sm:hidden text-lg">{tab.emoji}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={goToNextTab}
              className="border-4 border-black rounded-2xl font-bold transition-all duration-200 shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] p-2 sm:p-3 bg-white hover:bg-gray-50 flex-shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Next tab"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

        {/* Skills Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20 px-2 py-2">
          {skills[activeTab]?.map((skill, index) => (
            <SkillCard
              key={index}
              icon={skill.icon}
              name={skill.name}
              level={skill.level}
              levelColor={skill.levelColor}
              description={skill.description}
              stars={skill.stars}
            />
          ))}
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 px-2 py-2">
          {features.map((feature, index) => (
            <FeatureCard key={index} icon={feature.icon} title={feature.title} description={feature.description} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default SkillsSection;

