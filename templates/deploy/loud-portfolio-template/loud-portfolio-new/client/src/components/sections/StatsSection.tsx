import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import CountUp from '../animations/CountUp';
import FadeIn from '../animations/FadeIn';

const StatsSection = () => {
  const stats = [
    {
      id: 1,
      number: "5+",
      title: "YEARS OF MARKETING EXPERIENCE",
      subtitle: "HELPING BUSINESSES GROW DIGITALLY",
      color: "white",
      bgColor: "bg-primary-dark",
      textColor: "text-white"
    },
    {
      id: 2,
      number: "50+",
      title: "Successful Projects Delivered",
      color: "green",
      bgColor: "bg-accent-green",
      textColor: "text-white"
    },
    {
      id: 3,
      number: "95%",
      title: "Client Satisfaction Rate",
      color: "yellow",
      bgColor: "bg-accent-yellow",
      textColor: "text-black"
    }
  ];

  const whyChooseStats = [
    {
      id: 1,
      number: "24/7",
      title: "Dedicated Support & Communication",
      color: "purple",
      bgColor: "bg-accent-purple",
      textColor: "text-white"
    },
    {
      id: 2,
      number: "150%",
      title: "Average ROI Improvement for Clients",
      color: "red",
      bgColor: "bg-accent-red",
      textColor: "text-white"
    }
  ];

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="bg-primary-dark relative overflow-hidden">
      <div className="container mx-auto px-4 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <FadeIn delay={200}>
            <div className="text-white">
              {/* Tags */}
              <div className="flex flex-wrap gap-3 mb-8">
                <span className="bg-accent-orange text-white px-4 py-2 rounded-full text-sm font-semibold">
                  Business Growth
                </span>
                <span className="bg-accent-red text-white px-4 py-2 rounded-full text-sm font-semibold">
                  Success
                </span>
                <span className="bg-accent-yellow text-black px-4 py-2 rounded-full text-sm font-semibold">
                  Performance Metrics
                </span>
              </div>

              <h2 className="section-title mb-6 leading-tight">
                <span className="block">
                  <CountUp end="5" className="text-6xl" />X ACHIEVED ROI ON AD
                </span>
                <span className="block">SPEND CONSISTENTLY!</span>
                <span className="block text-gray-400 text-3xl md:text-4xl">
                  FOR OUR CLIENTS.
                </span>
              </h2>

              <button 
                onClick={scrollToContact}
                className="btn-primary mb-8"
              >
                GET IN TOUCH →
              </button>
            </div>
          </FadeIn>

          {/* Right Content - Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 350+ Card */}
            <FadeIn delay={400}>
              <div className="metric-card bg-accent-green text-white relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-4xl md:text-5xl font-bold mb-2">
                      <CountUp end="350" />+
                    </div>
                    <div className="text-sm opacity-90">
                      Successful Campaigns<br />
                      Launched Industries
                    </div>
                  </div>
                  <ArrowUpRight className="w-8 h-8 opacity-70" />
                </div>
                {/* Decorative triangle */}
                <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[40px] border-l-transparent border-b-[40px] border-b-white/20"></div>
              </div>
            </FadeIn>

            {/* 67% Card */}
            <FadeIn delay={600}>
              <div className="metric-card bg-accent-yellow text-white relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-4xl md:text-5xl font-bold mb-2">
                      <CountUp end="67" />%
                    </div>
                    <div className="text-sm opacity-80">
                      Growth in Conversion<br />
                      Rates on Average
                    </div>
                  </div>
                  <ArrowUpRight className="w-8 h-8 opacity-70" />
                </div>
                {/* Decorative triangle */}
                <div className="absolute bottom-0 right-0 w-0 h-0 border-l-[40px] border-l-transparent border-b-[40px] border-b-white/20"></div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

    </section>
  );
};

export default StatsSection;

