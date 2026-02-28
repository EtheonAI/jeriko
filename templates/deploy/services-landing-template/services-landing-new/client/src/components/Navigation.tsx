import { useState } from 'react';
import { handleAnchorClick } from '@/utils/scrollUtils';

function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };


  return (
    <header className="bg-white/50 shadow-sm sticky top-0 z-50 backdrop-blur-md">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <a href="/" className="text-2xl font-bold text-gray-800">
          Our Company
        </a>
        
        {/* Desktop Navigation and CTA Button */}
        <div className="hidden md:flex items-center space-x-8">
          <a 
            href="/" 
            className="text-gray-800 hover:text-gray-600 font-medium"
          >
            Home
          </a>
          <a 
            href="#about" 
            className="text-gray-800 hover:text-gray-600 font-medium"
            onClick={handleAnchorClick}
          >
            About
          </a>
          <a 
            href="#services" 
            className="text-gray-800 hover:text-gray-600 font-medium"
            onClick={handleAnchorClick}
          >
            Services
          </a>
          <a 
            href="#locations" 
            className="text-gray-800 hover:text-gray-600 font-medium"
            onClick={handleAnchorClick}
          >
            Contact
          </a>
          <div className="border-l border-gray-300 h-6 mx-2"></div>
          <button className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            Get Started
          </button>
        </div>
        
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden focus:outline-none" 
          aria-label="Toggle menu"
          onClick={toggleMenu}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
      </nav>
      
      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200">
          <div className="container mx-auto px-6 py-4 flex flex-col space-y-3">
            <a 
              href="/" 
              className="text-gray-600 hover:text-gray-900 py-2"
            >
              Home
            </a>
            <a 
              href="#about" 
              className="text-gray-600 hover:text-gray-900 py-2"
              onClick={handleAnchorClick}
            >
              About
            </a>
            <a 
              href="#services" 
              className="text-gray-600 hover:text-gray-900 py-2"
              onClick={handleAnchorClick}
            >
              Services
            </a>
            <a 
              href="#locations" 
              className="text-gray-600 hover:text-gray-900 py-2"
              onClick={handleAnchorClick}
            >
              Contact
            </a>
            <button className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors text-left">
              Get Started
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navigation;

