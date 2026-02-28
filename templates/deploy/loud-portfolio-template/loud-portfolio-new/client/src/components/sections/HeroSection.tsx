import React from 'react';
import { Star, Plus, Crown, Award } from 'lucide-react';
import { Highlighter } from '@/components/magicui/highlighter';

const HeroSection = () => {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="min-h-screen bg-primary-dark relative overflow-hidden flex items-center">
      {/* Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <Star className="absolute top-20 left-10 text-accent-yellow w-6 h-6 animate-pulse" />
        <Plus className="absolute top-32 right-20 text-accent-green w-8 h-8 animate-bounce" />
        <Star className="absolute bottom-40 left-20 text-accent-purple w-5 h-5 animate-pulse" />
        <Plus className="absolute bottom-20 right-10 text-accent-orange w-6 h-6 animate-bounce" />
        <Crown className="absolute top-40 left-1/4 text-accent-red w-7 h-7 animate-pulse" />
        <Award className="absolute bottom-60 right-1/4 text-accent-blue w-6 h-6 animate-bounce" />
      </div>

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="text-center max-w-6xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 text-[#dad5f2] py-4 rounded-full">
            <span className="text-md font-semibold">Freelance Marketing Expert</span>
          </div>

          {/* Main Title */}
          <h1 className="hero-title text-white mb-8 leading-tight">
            <span className="block">MARKETING</span>
            <span className="block">
              <span className="text-accent-purple">STRATEGIES THAT</span>{' '}
              <span className="text-accent-orange">DRIVE</span>
            </span>
            <span className="block text-white"><Highlighter action="underline" color='var(--accent-orange)'>REAL </Highlighter> RESULTS</span>
          </h1>

          {/* Description */}
          <p className="text-gray-300 text-lg md:text-xl max-w-3xl mx-auto mb-12 leading-relaxed">
            Hi, I'm Alex Martinez, a freelance marketing specialist helping businesses grow through data-driven strategies and creative campaigns that convert.
          </p>

          {/* CTA Button */}
          <button 
            onClick={scrollToContact}
            className="btn-primary text-lg px-8 py-4"
          >
            LET'S WORK TOGETHER →
          </button>
        </div>
      </div>

      {/* Bottom decorative elements */}
      <div className="absolute bottom-0 left-0 right-0">
        <div className="flex justify-center space-x-4 pb-8">
          <div className="w-3 h-3 bg-accent-green rounded-full"></div>
          <div className="w-3 h-3 bg-accent-purple rounded-full"></div>
          <div className="w-3 h-3 bg-accent-orange rounded-full"></div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;

