import React, { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'

const Hero = () => {
  // Memoize animation variants to prevent recreating them on each render
  const backgroundAnimations = useMemo(() => ({
    primary: {
      scale: [1, 1.1, 1],
      rotate: [0, 180, 360]
    },
    secondary: {
      scale: [1, 1.2, 1],
      rotate: [360, 180, 0]
    }
  }), []);

  return (
    <section className="relative min-h-screen flex pb-12 items-end justify-center overflow-hidden" style={{background: 'linear-gradient(to bottom right, #FFE8D6, white, #FFFBF0)'}}>
      {/* Glowing Circle Background */}
      <motion.div 
        className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      >
        <motion.div 
          className="w-[400px] h-[400px] md:w-[600px] md:h-[600px] lg:w-[800px] lg:h-[800px] rounded-full blur-3xl will-change-transform"
          style={{background: 'linear-gradient(to bottom right, #FFD3AC66, #fff08530, #FFD3AC33)'}}
          animate={backgroundAnimations.primary}
          transition={{ 
            duration: 30, 
            repeat: Infinity, 
            ease: "linear" 
          }}
        />
      </motion.div>

      {/* Additional Glow Effects */}
      <motion.div 
        className="absolute top-1/4 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
      >
        <motion.div 
          className="w-[300px] h-[300px] md:w-[450px] md:h-[450px] lg:w-[600px] lg:h-[600px] rounded-full blur-2xl will-change-transform"
          style={{background: 'linear-gradient(to bottom right, #ffe02a33, #FFD3AC26, #fac8001a)'}}
          animate={backgroundAnimations.secondary}
          transition={{ 
            duration: 40, 
            repeat: Infinity, 
            ease: "linear" 
          }}
        />
      </motion.div>

      {/* White Semicircle Overlay */}
      <motion.div 
        className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-[15vh] md:-translate-y-[20vh] lg:-translate-y-[22vh]"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
      >
        <div 
          className="w-[70vw] h-[30vh] md:w-[60vw] md:h-[35vh] lg:w-[50vw] lg:h-[40vh] bg-white"
          style={{
            clipPath: 'ellipse(60% 100% at 50% 0%)',
            borderRadius: '0 0 50% 50%'
          }}
        />
      </motion.div>

      {/* Hero Content */}
      <motion.div 
        className="relative z-10 max-w-4xl mx-auto text-center px-4 md:px-6"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1, delay: 0.8 }}
      >
        <motion.h1 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="text-4xl md:text-6xl lg:text-8xl font-medium text-gray-900 mb-4 md:mb-6 leading-tight font-lustria"
        >
          Sunrise Yoga at the Skyline
        </motion.h1>
        
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="mb-6 md:mb-8"
        >
          <p className="text-lg md:text-xl lg:text-2xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Join us for an unforgettable yoga experience on a luxury rooftop deck with breathtaking city views.
          </p>
          <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-4 text-gray-700 font-satoshi">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              Saturday, December 21st
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              6:30 AM - 8:30 AM
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Skyline Hotel Rooftop
            </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.6 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button 
            asChild 
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 md:px-8 py-4 md:py-6 rounded-full text-base md:text-lg font-satoshi transition-all duration-300 hover:shadow-xl"
          >
            <a href="#contact">Book Your Spot</a>
          </Button>
        </motion.div>
      </motion.div>
    </section>
  )
}

export default React.memo(Hero)