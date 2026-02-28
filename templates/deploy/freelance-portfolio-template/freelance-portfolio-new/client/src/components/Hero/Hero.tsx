import React, { useRef, lazy, Suspense } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, useScroll, useTransform } from 'framer-motion'

// Lazy load the portfolio section
const PortfolioSection = lazy(() => import('./PortfolioSection'))

const Hero = () => {
  const container = useRef(null)
  
  const { scrollYProgress } = useScroll({
    target: container,
    offset: ['start start', 'end start']
  })
  
  // Transform values for hero minimizing effect - hooks must be at top level - more intense scaling
  const heroScale = useTransform(scrollYProgress, [0, 0.2, 0.5, 0.8], [1, 0.75, 0.5, 0.3])
  const heroY = useTransform(scrollYProgress, [0, 0.3, 0.6, 0.8], [0, -80, -200, -400])
  // Make content gradually translucent as user scrolls up - more intense effect
  const heroOpacity = useTransform(scrollYProgress, [0, 0.1, 0.3, 0.5, 0.7], [1, 0.6, 0.3, 0.1, 0])
  
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div ref={container}>
      {/* Hero Section */}
      <section className="h-[80vh] px-4 sm:px-6 lg:px-8 flex items-end bg-gray-50">
        <div className="max-w-7xl mx-auto w-full pb-16">
          <motion.div 
            className="text-center transform-gpu"
            style={{ 
              scale: heroScale, 
              y: heroY, 
              opacity: heroOpacity,
              transformOrigin: 'center center'
            }}
          >
            {/* Badge */}
            <div className="inline-flex items-center px-4 py-2 bg-white rounded-full shadow-sm border border-gray-200 mb-8 animate-fade-in-down group">
              <span className="mr-2 font-medium text-lg leading-relaxed text-blue-600 font-sans">
                Trusted by 200+ clients
              </span>
              <ArrowUpRight 
                size={16} 
                className="text-blue-600 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" 
              />
            </div>

            {/* Main Headline */}
            <motion.h1 className="mb-6 animate-fade-in-up font-black text-gray-900 font-sans text-[clamp(2.5rem,8vw,6.25rem)] leading-[clamp(2.5rem,8vw,6.25rem)]">
              Building tomorrow's
              <br />
              digital experiences
            </motion.h1>

            {/* Subtitle */}
            <p className="max-w-3xl mx-auto mb-12 animate-fade-in-up animation-delay-200 font-normal text-xl leading-relaxed text-gray-500 font-sans">
              Transforming ideas into powerful digital solutions that drive growth,
              <br className="hidden sm:block" />
              engage audiences, and deliver exceptional user experiences
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animation-delay-400">
              <Button 
                onClick={() => scrollToSection('contact')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base rounded-full border-0 transform transition-all duration-300 hover:scale-105 hover:shadow-2xl group font-sans"
                size="lg"
              >
                <span className="flex items-center gap-2">
                  Start Your Project
                </span>
              </Button>
              <Button 
                onClick={() => scrollToSection('portfolio')}
                variant="ghost"
                className="px-6 py-3 bg-white hover:bg-gray-50 text-gray-900 font-semibold text-base rounded-full transform transition-all duration-300 hover:scale-105 hover:shadow-2xl group font-sans"
                size="lg"
              >
                <span className="flex items-center gap-2">
                  Explore Our Work
                </span>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Portfolio Section - Lazy Loaded */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }>
        <PortfolioSection />
      </Suspense>
    </div>
  )
}

export default Hero

