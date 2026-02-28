import { Link } from 'wouter';
import { handleAnchorClick } from '@/utils/scrollUtils';

function Footer() {
  return (
    <footer id="contact" className="bg-black text-white py-12">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <Link href="/" className="text-2xl font-bold text-white mb-4 block">
              Our Company
            </Link>
            <p className="text-gray-400 text-sm">
              Professional services for your success
            </p>
          </div>

          <div />
          
          <div />
          
          <div>
            <h3 className="text-lg font-semibold mb-4">Pages</h3>
            <div className="space-y-2">
              <Link href="/" className="block text-gray-400 hover:text-white transition-colors">
                Homepage
              </Link>
              <a 
                href="#about" 
                className="block text-gray-400 hover:text-white transition-colors cursor-pointer"
                onClick={handleAnchorClick}
              >
                About
              </a>
              <a 
                href="#services" 
                className="block text-gray-400 hover:text-white transition-colors cursor-pointer"
                onClick={handleAnchorClick}
              >
                Services
              </a>
              <a 
                href="#locations" 
                className="block text-gray-400 hover:text-white transition-colors cursor-pointer"
                onClick={handleAnchorClick}
              >
                Contact
              </a>
              <a 
                href="#contact" 
                className="block text-gray-400 hover:text-white transition-colors cursor-pointer"
                onClick={handleAnchorClick}
              >
                Contact
              </a>
            </div>
          </div>
          
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2024 Our Company. All rights reserved.
          </p>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <p className="text-gray-400 text-sm">
              Terms & Conditions Applied
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;

