import { Star } from 'lucide-react';

const ProjectsSection = () => {
  const games = [
    {
      id: 1,
      title: "Pet Paradise Island",
      ageRange: "Ages 5-8",
      description: "Build your dream animal sanctuary! Take care of adorable pets, design habitats, and learn about animal care in this heartwarming adventure.",
      features: [
        "Care for 50+ different animals",
        "Design and decorate your island",
        "Learn real animal facts",
        "Safe multiplayer pet playdates"
      ],
      bgColor: "bg-gradient-to-br from-[#FFB6C1] to-[#FF69B4]",
      image: "/pet_paradise_island_banner.webp"
    },
    {
      id: 2,
      title: "Castle Quest Chronicles",
      ageRange: "Ages 7-10",
      description: "Embark on an epic medieval adventure! Solve puzzles, help villagers, and become a legendary hero in this story-driven quest.",
      features: [
        "Exciting story with choices that matter",
        "Brain-teasing puzzles and riddles",
        "Build your own castle",
        "Team up with friends for quests"
      ],
      bgColor: "bg-gradient-to-br from-[#9370DB] to-[#6A5ACD]",
      image: "/castle_quest_chronicles_banner.webp"
    },
    {
      id: 3,
      title: "Space Explorers Academy",
      ageRange: "Ages 8-12",
      description: "Blast off into space! Learn real science, explore planets, and discover the wonders of the universe in this educational space adventure.",
      features: [
        "Explore realistic planets and moons",
        "Learn actual space science",
        "Build and customize spaceships",
        "Join space missions with friends"
      ],
      bgColor: "bg-gradient-to-br from-[#1E90FF] to-[#4169E1]",
      image: "/space_explorers_academy_banner.webp"
    }
  ];

  const additionalGames = [
    {
      title: "Math Wizard Academy",
      ageRange: "Ages 6-10",
      description: "Master math through magical adventures! Solve math puzzles to unlock spells and save the kingdom.",
      features: [
        "Adaptive difficulty levels",
        "Covers addition to multiplication",
        "Fun spell-casting rewards"
      ]
    },
    {
      title: "Creative Art Studio",
      ageRange: "Ages 5-12",
      description: "Unleash your creativity! Draw, paint, and create amazing digital art with kid-friendly tools.",
      features: [
        "Easy-to-use drawing tools",
        "Share art in safe gallery",
        "Weekly art challenges"
      ]
    }
  ];

  return (
    <section className="py-20 bg-[#F2F2F2] relative overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white border-4 border-black px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000] mb-8">
            <Star className="w-5 h-5 text-[#FF714B]" />
            Our Amazing Games
            <span className="text-xl">🎮</span>
          </div>
          
          <h2 className="text-5xl lg:text-7xl font-black mb-6">
            <span className="gradient-text">Our Amazing Games</span>
          </h2>
          
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Four incredible adventures designed to spark imagination and make learning fun!
          </p>
        </div>

        {/* Featured Games */}
        <div className="space-y-12 mb-20">
          {games.map((game) => (
            <div key={game.id} className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] transition-all duration-200 hover:shadow-[12px_12px_0px_0px_#000000] hover:translate-x-[-2px] hover:translate-y-[-2px] overflow-hidden">
              <div className="grid lg:grid-cols-2 gap-0">
                {/* Game Image */}
                <div className={`${game.bgColor} p-8 flex items-center justify-center min-h-[400px]`}>
                  {/* Game interface */}
                  <div className="bg-white/10 backdrop-blur-sm border-2 border-white/20 p-6 w-full max-w-lg">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 bg-red-400"></div>
                      <div className="w-3 h-3 bg-yellow-400"></div>
                      <div className="w-3 h-3 bg-green-400"></div>
                    </div>
                    <div className="text-center">
                      <img src={game.image} alt={game.title} className="w-full h-auto" />
                    </div>
                  </div>
                </div>
                
                {/* Game Details */}
                <div className="p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-3xl font-black">{game.title}</h3>
                    <div className="bg-[#FF714B] text-white px-3 py-1 text-sm font-bold border-2 border-black">
                      {game.ageRange}
                    </div>
                  </div>
                  
                  <p className="text-gray-700 mb-6 leading-relaxed">
                    {game.description}
                  </p>
                  
                  <div className="mb-6">
                    <h4 className="font-bold text-gray-800 mb-3">What You'll Love:</h4>
                    <div className="space-y-2">
                      {game.features.map((feature, featureIndex) => (
                        <div key={featureIndex} className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-[#FF714B]"></div>
                          <span className="text-sm text-gray-700">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <button className="bg-[#FF714B] text-white border-4 border-black font-bold px-6 py-3 hover:shadow-[4px_4px_0px_0px_#000000] transition-all w-fit">
                    Play Now
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Additional Games */}
        <div>
          <h3 className="text-3xl font-black mb-8 text-center">
            <span className="gradient-text">More Amazing Adventures</span>
          </h3>
          
          <div className="grid md:grid-cols-2 gap-8">
            {additionalGames.map((game, index) => (
              <div key={index} className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] transition-all duration-200 hover:shadow-[12px_12px_0px_0px_#000000] hover:translate-x-[-2px] hover:translate-y-[-2px] p-8">
                <div className="flex items-center gap-3 mb-4">
                  <h4 className="text-2xl font-black gradient-text">{game.title}</h4>
                  <div className="bg-[#C71E64] text-white px-2 py-1 text-xs font-bold border-2 border-black">
                    {game.ageRange}
                  </div>
                </div>
                <p className="text-gray-700 mb-6 leading-relaxed">{game.description}</p>
                <div className="space-y-2 mb-6">
                  {game.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-[#4D2D8C]"></div>
                      <span className="text-sm text-gray-700">{feature}</span>
                    </div>
                  ))}
                </div>
                <button className="bg-[#4D2D8C] text-white border-4 border-black font-bold px-6 py-3 hover:shadow-[4px_4px_0px_0px_#000000] transition-all">
                  Learn More
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProjectsSection;

