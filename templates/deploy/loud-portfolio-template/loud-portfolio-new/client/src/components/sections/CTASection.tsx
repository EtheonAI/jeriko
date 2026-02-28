import React from 'react';
import { Star, Plus, Crown, Award } from 'lucide-react';

const CTASection = () => {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="contact" className="bg-primary-dark py-20 relative overflow-hidden">
      {/* Decorative Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <Star className="absolute top-10 left-10 text-purple-400 w-8 h-8 animate-pulse" />
        <Plus className="absolute top-20 right-20 text-green-400 w-10 h-10 animate-bounce" />
        <Crown className="absolute bottom-20 left-20 text-yellow-400 w-6 h-6 animate-pulse" />
        <Award className="absolute bottom-10 right-10 text-orange-400 w-7 h-7 animate-pulse" />
        <Star className="absolute top-1/2 left-1/4 text-red-400 w-5 h-5 animate-pulse" />
        <Plus className="absolute bottom-1/2 right-1/4 text-blue-400 w-6 h-6 animate-bounce" />
      </div>

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="text-center max-w-6xl mx-auto">
          {/* Main Title */}
          <h2 className="section-title text-white mb-8 leading-tight">
            <span className="block">READY TO GROW</span>
            <span className="block text-accent-green">YOUR BUSINESS</span>
            <span className="block">& ACHIEVE YOUR</span>
            <span className="block">GOALS?</span>
          </h2>

          {/* CTA Button */}
          <button 
            onClick={scrollToContact}
            className="btn-primary text-xl px-12 py-6"
          >
            LET'S START TODAY →
          </button>

          {/* Contact Information */}
          <div className="mt-16 text-center">
            <p className="text-gray-300 mb-4">Ready to transform your marketing?</p>
            <div className="flex flex-col md:flex-row justify-center items-center space-y-4 md:space-y-0 md:space-x-8">
              <a 
                href="mailto:alex@marketingexpert.com" 
                className="text-accent-green hover:text-accent-teal transition-colors duration-300"
              >
                alex@marketingexpert.com
              </a>
              <a 
                href="tel:+1234567890" 
                className="text-accent-green hover:text-accent-teal transition-colors duration-300"
              >
                +1 (234) 567-890
              </a>
            </div>
          </div>
        </div>
      </div>

    </section>
  );
};

export default CTASection;

