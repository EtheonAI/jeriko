import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXTwitter, faInstagram, faLinkedin, faYoutube } from '@fortawesome/free-brands-svg-icons'

const Footer = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <footer className="bg-gray-50 pt-12 sm:pt-16 pb-6 sm:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-8 sm:mb-12">
          {/* Logo and Description */}
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="text-lg sm:text-xl font-bold text-gray-900">Digital Studio</span>
            </div>
            <p className="text-sm sm:text-base text-gray-600 mb-6 max-w-md">
              Digital agency creating innovative web solutions, mobile apps, and brand experiences that drive business growth. Based in San Francisco, California.
            </p>
          </div>

          {/* Navigation Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Navigation</h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <button 
                  onClick={() => scrollToSection('portfolio')}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Work
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('services')}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Services
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('articles')}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Blog
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('about')}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  About
                </button>
              </li>
              <li>
                <button 
                  onClick={() => scrollToSection('contact')}
                  className="text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Contact
                </button>
              </li>
            </ul>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-sm sm:text-base">Socials</h3>
            <ul className="space-y-2 sm:space-y-3">
              <li>
                <a 
                  href="#" 
                  className="flex items-center text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <FontAwesomeIcon icon={faXTwitter} className="mr-2 w-3 h-3 sm:w-4 sm:h-4" />
                  X
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <FontAwesomeIcon icon={faInstagram} className="mr-2 w-3 h-3 sm:w-4 sm:h-4" />
                  Instagram
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <FontAwesomeIcon icon={faLinkedin} className="mr-2 w-3 h-3 sm:w-4 sm:h-4" />
                  LinkedIn
                </a>
              </li>
              <li>
                <a 
                  href="#" 
                  className="flex items-center text-sm sm:text-base text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <FontAwesomeIcon icon={faYoutube} className="mr-2 w-3 h-3 sm:w-4 sm:h-4" />
                  YouTube
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-200 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between">
          <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-0">
            © 2025 Digital Studio. All rights reserved.
          </p>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <span className="text-xs sm:text-sm text-gray-600">Built with</span>
            <div className="px-2 sm:px-3 py-1 bg-blue-100 rounded-full text-xs sm:text-sm font-medium text-blue-800">
              React
            </div>
            <span className="text-xs sm:text-sm text-gray-600">&</span>
            <div className="px-2 sm:px-3 py-1 bg-purple-100 rounded-full text-xs sm:text-sm font-medium text-purple-800">
              Vite
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer

