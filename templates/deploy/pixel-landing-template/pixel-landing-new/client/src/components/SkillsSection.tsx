const SkillsSection = () => {
  const benefits = [
    {
      icon: '🚀',
      title: 'Safe Gaming Environment',
      description: 'Advanced safety features and 24/7 monitoring'
    },
    {
      icon: '⏰',
      title: 'Parental Controls',
      description: 'Easy-to-use dashboard for managing screen time and friends'
    },
    {
      icon: '💼',
      title: 'Educational Content',
      description: 'Learning disguised as fun adventures and challenges'
    },
    {
      icon: '🤖',
      title: 'Modern Technology',
      description: 'Built with the latest gaming and safety technologies'
    }
  ];

  return (
    <section className="py-20 bg-[#F2F2F2] relative overflow-hidden">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white border-4 border-black px-6 py-3 font-bold shadow-[4px_4px_0px_0px_#000000] mb-8">
            <span className="text-2xl">😎</span>
            GAMING FEATURES
          </div>
          
          <h2 className="text-5xl lg:text-7xl font-black mb-6">
            <span className="text-black">SAFETY </span>
            <span className="gradient-text">FIRST</span>
          </h2>
          
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Your child's security is our priority
          </p>
        </div>

        {/* Safety Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <div key={index} className="bg-white border-4 border-black shadow-[8px_8px_0px_0px_#000000] transition-all duration-200 hover:shadow-[12px_12px_0px_0px_#000000] hover:translate-x-[-2px] hover:translate-y-[-2px] p-6 text-center">
              <div className="text-4xl mb-4">{benefit.icon}</div>
              <h3 className="text-lg font-bold mb-2">{benefit.title}</h3>
              <p className="text-gray-600 text-sm">{benefit.description}</p>
              <div className="w-12 h-1 bg-[#FF714B] mx-auto mt-4"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SkillsSection;

