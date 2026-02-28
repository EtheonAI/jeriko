import { useState } from 'react';

function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
        {/* Logo */}
        <a href="#home" className="flex items-center space-x-2">
          <img src="/assets/logo.webp" alt="Zenith Logo" className="w-8 h-8" />
          <span className="text-xl font-bold">Zenith</span>
        </a>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex space-x-8">
          <a href="#home" className="text-blue-500 font-medium">Home</a>
          <a href="#features" className="text-gray-600 hover:text-blue-500 transition-colors">Features</a>
          <a href="#screenshots" className="text-gray-600 hover:text-blue-500 transition-colors">Screenshots</a>
          <a href="#help-center" className="text-gray-600 hover:text-blue-500 transition-colors">Help Center</a>
        </div>
        
        {/* Mobile Menu Button */}
        <button 
          className="md:hidden focus:outline-none" 
          aria-label="Toggle menu"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
      </nav>
      
      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200">
          <div className="container mx-auto px-4 py-3 flex flex-col space-y-3">
            <a href="#home" className="text-blue-500 font-medium py-2">Home</a>
            <a href="#features" className="text-gray-600 hover:text-blue-500 transition-colors py-2">Features</a>
            <a href="#screenshots" className="text-gray-600 hover:text-blue-500 transition-colors py-2">Screenshots</a>
            <a href="#help-center" className="text-gray-600 hover:text-blue-500 transition-colors py-2">Help Center</a>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navigation;

