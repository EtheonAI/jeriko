import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-accent-green rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">A</span>
              </div>
              <span className="text-white font-bold text-xl">ALEX MARTINEZ</span>
            </div>
            <p className="text-gray-400 leading-relaxed max-w-md">
              Freelance marketing specialist helping businesses grow through data-driven strategies and creative campaigns.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><a href="#home" className="text-gray-400 hover:text-accent-green transition-colors duration-300">Home</a></li>
              <li><a href="#about" className="text-gray-400 hover:text-accent-green transition-colors duration-300">About Us</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-accent-green transition-colors duration-300">Services</a></li>
              <li><a href="#testimonials" className="text-gray-400 hover:text-accent-green transition-colors duration-300">Reviews</a></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Contact</h3>
            <ul className="space-y-2">
              <li className="text-gray-400">alex@marketingexpert.com</li>
              <li className="text-gray-400">+1 (234) 567-890</li>
              <li className="text-gray-400">123 Business St, City, State 12345</li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © 2024 Alex Martinez. All rights reserved.
          </p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="text-gray-400 hover:text-accent-green transition-colors duration-300 text-sm">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-400 hover:text-accent-green transition-colors duration-300 text-sm">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

