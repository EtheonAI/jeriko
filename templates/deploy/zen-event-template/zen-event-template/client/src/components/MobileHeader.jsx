import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SparkleIcon from '@/assets/sparkle.svg'
import { navItems } from './Header'

const MobileHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)


  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleNavClick = (item) => {
    setIsMenuOpen(false)
    // Smooth scroll to section
    const element = document.getElementById(item.toLowerCase())
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <>
      {/* Transparent Top Bar */}
      <motion.header 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="fixed top-0 left-0 right-0 z-50 bg-transparent"
      >
        <div className="flex items-center justify-between p-4">
          {/* Hamburger Menu Button */}
          <motion.button
            onClick={toggleMenu}
            className="relative w-8 h-8 flex flex-col justify-center items-center space-y-1.5 z-[60]"
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle menu"
          >
            <motion.div
              className={`w-6 h-0.5 rounded-full ${isMenuOpen ? 'bg-white' : 'bg-gray-800'}`}
              animate={{
                rotate: isMenuOpen ? 45 : 0,
                y: isMenuOpen ? 6 : 0,
              }}
              transition={{ duration: 0.3 }}
            />
            <motion.div
              className={`w-6 h-0.5 rounded-full ${isMenuOpen ? 'bg-white' : 'bg-gray-800'}`}
              animate={{
                opacity: isMenuOpen ? 0 : 1,
              }}
              transition={{ duration: 0.3 }}
            />
            <motion.div
              className={`w-6 h-0.5 rounded-full ${isMenuOpen ? 'bg-white' : 'bg-gray-800'}`}
              animate={{
                rotate: isMenuOpen ? -45 : 0,
                y: isMenuOpen ? -6 : 0,
              }}
              transition={{ duration: 0.3 }}
            />
          </motion.button>

          {/* Center Logo/Icon */}
          <motion.div 
            className="absolute left-1/2 transform -translate-x-1/2"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <motion.div 
              className="w-10 h-10 flex items-center justify-center"
              whileHover={{ rotate: 15, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <img 
                src={SparkleIcon} 
                alt="Sparkle" 
                className="w-6 h-6"
                style={{ 
                  filter: isMenuOpen 
                    ? 'brightness(0) saturate(100%) invert(100%)' 
                    : 'brightness(0) saturate(100%) invert(84%) sepia(23%) saturate(286%) hue-rotate(314deg) brightness(102%) contrast(96%)'
                }}
              />
            </motion.div>
          </motion.div>

          {/* Placeholder for balance */}
          <div className="w-8 h-8"></div>
        </div>
      </motion.header>

      {/* Full Screen Mobile Navigation Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex flex-col"
            onClick={() => setIsMenuOpen(false)}
          >
            {/* Close Button */}
            <motion.button
              onClick={() => setIsMenuOpen(false)}
              className="absolute top-6 right-6 w-12 h-12 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all duration-200 z-10"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              aria-label="Close menu"
            >
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current"
              >
                <path 
                  d="M18 6L6 18M6 6L18 18" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </svg>
            </motion.button>

            {/* Menu Content */}
            <div className="flex-1 flex flex-col justify-center items-center px-8" onClick={(e) => e.stopPropagation()}>
              {/* Logo Section */}
              <motion.div 
                className="mb-16"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <motion.div 
                  className="w-16 h-16 flex items-center justify-center"
                  whileHover={{ rotate: 360 }}
                  transition={{ type: "spring", stiffness: 200, duration: 0.8 }}
                >
                  <img 
                    src={SparkleIcon} 
                    alt="Sparkle" 
                    className="w-12 h-12"
                    style={{ filter: 'brightness(0) saturate(100%) invert(100%)' }}
                  />
                </motion.div>
              </motion.div>

              {/* Navigation Items */}
              <nav className="w-full max-w-md">
                <ul className="space-y-6">
                  {navItems.map((item, index) => (
                    <motion.li
                      key={item}
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ 
                        duration: 0.4, 
                        delay: 0.3 + (index * 0.08),
                        ease: "easeOut"
                      }}
                      className="text-center"
                    >
                      <motion.button
                        onClick={() => handleNavClick(item)}
                        className="w-full py-4 px-6 text-white text-2xl font-satoshi font-light tracking-wide hover:bg-white/10 rounded-lg transition-all duration-300 relative overflow-hidden group"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-pink-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          initial={false}
                        />
                        <span className="relative z-10">{item}</span>
                      </motion.button>
                    </motion.li>
                  ))}
                </ul>
              </nav>

              {/* Bottom Message */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="mt-16 text-center"
              >
                <p className="text-white/60 text-sm font-satoshi">
                  Tap anywhere to close menu
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default MobileHeader