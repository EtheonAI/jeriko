import { Linkedin } from 'lucide-react';
import { handleAnchorClick } from '@/lib/scrollUtils';

function Footer() {
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    handleAnchorClick(e);
  };

  return (
    <footer className="bg-gray-900 border-t border-gray-800 py-12">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Logo and Description */}
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Dealvia</h3>
            <p className="text-gray-400 leading-relaxed">
              Your premier destination for exclusive deals and unbeatable savings.
            </p>
          </div>
          
          {/* Navigation Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">Navigation</h4>
            <ul className="space-y-3">
              <li>
                <a 
                  href="#features" 
                  className="text-gray-400 hover:text-orange-500 transition-colors duration-200"
                  onClick={handleLinkClick}
                >
                  Features
                </a>
              </li>
              <li>
                <a 
                  href="#pricing" 
                  className="text-gray-400 hover:text-orange-500 transition-colors duration-200"
                  onClick={handleLinkClick}
                >
                  Pricings
                </a>
              </li>
              <li>
                <a 
                  href="#how-it-works" 
                  className="text-gray-400 hover:text-orange-500 transition-colors duration-200"
                  onClick={handleLinkClick}
                >
                  How it works
                </a>
              </li>
            </ul>
          </div>
        </div>
        
        {/* Bottom Section */}
        <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2024 Dealvia. All rights reserved.
          </p>
          
          {/* Social Media */}
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <a 
              href="#" 
              aria-label="LinkedIn" 
              className="text-gray-400 hover:text-orange-500 transition-colors duration-200"
            >
              <Linkedin className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

