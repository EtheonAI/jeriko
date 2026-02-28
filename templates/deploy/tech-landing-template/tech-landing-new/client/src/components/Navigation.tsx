import { useState } from 'react';
import { handleAnchorClick } from '@/lib/scrollUtils';
import logo from '../assets/logo.webp';

function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    handleAnchorClick(e);
    setIsMenuOpen(false);
  };

  return (
    <header className="bg-[var(--bg-gray-900)] sticky top-0 z-50 border-b border-[var(--border-gray-800)]">
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        {/* Logo */}
        <div className="flex items-center">
          <img src={logo} alt="Dealvia Logo" className="h-8" />
        </div>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-8">
          <a 
            href="#features" 
            className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] transition-colors duration-200"
            onClick={handleLinkClick}
          >
            Features
          </a>
          <a 
            href="#pricing" 
            className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] transition-colors duration-200"
            onClick={handleLinkClick}
          >
            Pricings
          </a>
          <a 
            href="#how-it-works" 
            className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] transition-colors duration-200"
            onClick={handleLinkClick}
          >
            How it works
          </a>
        </div>

        
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden focus:outline-none text-[var(--text-primary)] relative z-50" 
          aria-label="Toggle menu"
          onClick={toggleMenu}
        >
          <div className="w-6 h-6 flex flex-col justify-center items-center">
            <span 
              className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm ${
                isMenuOpen ? 'rotate-45 translate-y-1' : '-translate-y-0.5'
              }`}
            ></span>
            <span 
              className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm my-0.5 ${
                isMenuOpen ? 'opacity-0' : 'opacity-100'
              }`}
            ></span>
            <span 
              className={`bg-current block transition-all duration-300 ease-out h-0.5 w-6 rounded-sm ${
                isMenuOpen ? '-rotate-45 -translate-y-1' : 'translate-y-0.5'
              }`}
            ></span>
          </div>
        </button>
      </nav>
      
      {/* Mobile Navigation */}
      <div 
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          isMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-[var(--bg-gray-800)] border-t border-[var(--border-gray-700)] backdrop-blur-md bg-opacity-95">
          <div className="container mx-auto px-6 py-6">
            <div className="flex flex-col space-y-1">
              <a 
                href="#features" 
                className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-gray-700)] py-3 px-4 rounded-lg transition-all duration-200 text-lg font-medium"
                onClick={handleLinkClick}
              >
                Features
              </a>
              <a 
                href="#pricing" 
                className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-gray-700)] py-3 px-4 rounded-lg transition-all duration-200 text-lg font-medium"
                onClick={handleLinkClick}
              >
                Pricings
              </a>
              <a 
                href="#how-it-works" 
                className="text-[var(--text-gray-300)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-gray-700)] py-3 px-4 rounded-lg transition-all duration-200 text-lg font-medium"
                onClick={handleLinkClick}
              >
                How it works
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navigation;

