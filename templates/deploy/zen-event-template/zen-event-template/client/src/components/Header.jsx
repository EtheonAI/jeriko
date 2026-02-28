import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useIsMobile } from '@/hooks/use-mobile.js'
import MobileHeader from './MobileHeader.jsx'
import SparkleIcon from '@/assets/sparkle.svg'

export const navItems = ['About', 'Venue', 'Schedule', 'Pricing', 'Prepare', 'Contact', 'FAQ']

const Header = () => {
  const isMobile = useIsMobile()
  const [activeSection, setActiveSection] = useState('')

  // Handle smooth scrolling for navigation
  const handleNavClick = (item) => {
    const element = document.getElementById(item.toLowerCase())
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Detect active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const sections = navItems.map(item => ({
        id: item.toLowerCase(),
        element: document.getElementById(item.toLowerCase())
      })).filter(section => section.element)

      let currentSection = ''
      const scrollTop = window.scrollY + 100 // offset for header

      for (const section of sections) {
        const rect = section.element.getBoundingClientRect()
        const offsetTop = window.scrollY + rect.top
        
        if (scrollTop >= offsetTop && scrollTop < offsetTop + rect.height) {
          currentSection = section.id
          break
        }
      }

      // Don't set any active section when at the very top (Hero section)
      if (scrollTop < 200) {
        currentSection = ''
      }

      setActiveSection(currentSection)
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Initial check

    return () => window.removeEventListener('scroll', handleScroll)
  }, [navItems])

  // Render mobile header for mobile devices
  if (isMobile) {
    return <MobileHeader />
  }

  // Desktop header
  return (
    <motion.header 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 p-4 lg:p-6 lg:px-12 bg-gradient-to-b from-white to-transparent"
    >
      {/* Navigation */}
      <nav 
        className="flex flex-col space-y-4 absolute left-4 lg:left-6 xl:left-12 top-4 lg:top-6"
      >
        {navItems.map((item, index) => {
          const isActive = activeSection === item.toLowerCase()
          return (
            <motion.button
              key={item}
              onClick={() => handleNavClick(item)}
              className={`text-left font-satoshi text-sm transition-all duration-300 relative group ${
                isActive 
                  ? 'text-orange-300' 
                  : 'text-gray-700 hover:text-orange-300'
              }`}
              initial={{ x: -20, opacity: 0 }}
              animate={{ 
                x: 0, 
                opacity: 1,
              }}
              transition={{ duration: 0.5, delay: 0.3 + (index * 0.1) }}
              whileHover={{ 
                x: isActive ? 12 : 8,
                transition: { type: "spring", stiffness: 300, damping: 20 }
              }}
              style={{
                transform: isActive ? 'translateX(8px)' : 'translateX(0)',
              }}
            >
              {/* Active indicator dot */}
              <motion.div
                className="absolute -left-3 top-1/2 transform -translate-y-1/2 w-1.5 h-1.5 bg-orange-300 rounded-full"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: isActive ? 1 : 0, 
                  opacity: isActive ? 1 : 0 
                }}
                transition={{ duration: 0.2 }}
              />
              
              {/* Hover indicator line */}
              <motion.div
                className="absolute -left-2 top-0 bottom-0 w-0.5 bg-orange-200 rounded-full opacity-0 group-hover:opacity-100"
                initial={{ scaleY: 0 }}
                whileHover={{ scaleY: 1 }}
                transition={{ duration: 0.2 }}
              />
              
              <span className="relative z-10">{item}</span>
            </motion.button>
          )
        })}
      </nav>

      {/* Center Logo/Icon */}
      <motion.div 
        className="absolute left-1/2 top-4 lg:top-6 transform -translate-x-1/2"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <motion.div 
          className="w-12 h-12 lg:w-16 lg:h-16 flex items-center justify-center"
          whileHover={{ rotate: 15, scale: 1.1 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <img 
            src={SparkleIcon} 
            alt="Sparkle" 
            className="w-8 h-8 lg:w-12 lg:h-12"
            style={{ filter: 'brightness(0) saturate(100%) invert(84%) sepia(23%) saturate(286%) hue-rotate(314deg) brightness(102%) contrast(96%)' }}
          />
        </motion.div>
      </motion.div>
    </motion.header>
  )
}

export default Header;