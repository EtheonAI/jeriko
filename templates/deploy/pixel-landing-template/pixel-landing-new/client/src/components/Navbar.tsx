import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="bg-[#F2F2F2]">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center space-x-4">
            <img 
              src="/pixelplay_kids_logo_icon.webp" 
              alt="PixelPlay Kids Logo" 
              className="h-12 w-12 transition-all duration-200 hover:scale-110"
            />
            <div className="hidden sm:block">
              <h1 className="text-2xl font-black text-[#4D2D8C]">
                PixelPlay Kids
              </h1>
              <p className="text-sm text-gray-600 font-medium">
                Safe Gaming for Kids
              </p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a 
              href="#home" 
              className="text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
            >
              Home
            </a>
            <a 
              href="#games" 
              className="text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
            >
              Games
            </a>
            <a 
              href="#about" 
              className="text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
            >
              About
            </a>
            <a 
              href="#parents" 
              className="text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
            >
              Parents
            </a>
            <button className="bg-[#FF714B] text-white border-2 border-black font-bold px-6 py-2 shadow-[3px_3px_0px_0px_#000000] hover:shadow-[5px_5px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200">
              Play Now
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              className="p-2 border-2 border-black bg-white shadow-[3px_3px_0px_0px_#000000] hover:shadow-[5px_5px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200"
            >
              {isMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-[#F2F2F2]">
            <div className="px-6 py-4 space-y-4">
              <a 
                href="#home" 
                className="block text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
                onClick={() => setIsMenuOpen(false)}
              >
                Home
              </a>
              <a 
                href="#games" 
                className="block text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
                onClick={() => setIsMenuOpen(false)}
              >
                Games
              </a>
              <a 
                href="#about" 
                className="block text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
                onClick={() => setIsMenuOpen(false)}
              >
                About
              </a>
              <a 
                href="#parents" 
                className="block text-lg font-bold text-gray-800 hover:text-[#FF714B] transition-colors duration-200"
                onClick={() => setIsMenuOpen(false)}
              >
                Parents
              </a>
              <button className="w-full bg-[#FF714B] text-white border-2 border-black font-bold px-6 py-3 shadow-[3px_3px_0px_0px_#000000] hover:shadow-[5px_5px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200">
                Play Now
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

