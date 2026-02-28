import { useState, useEffect } from 'react'
import Marquee from 'react-fast-marquee'
import heroImage from '@/assets/hero.webp'
import { ShinyButton } from "@/components/magicui/shiny-button";

interface HeroProps {
  onNavigationChange?: (sectionId: string) => void;
}

const Hero = ({ onNavigationChange }: HeroProps) => {
  const [activeSection, setActiveSection] = useState('home')
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  })

  // Countdown to party (October 27, 2024, 9:00 PM)
  useEffect(() => {
    const partyDate = new Date('2024-10-27T21:00:00')
    
    const timer = setInterval(() => {
      const now = new Date()
      const difference = partyDate.getTime() - now.getTime()
      
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000)
        })
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const navigationItems = [
    { id: 'home', label: 'Home' },
    { id: 'schedule', label: 'Schedule' }
  ]

  const handleNavClick = (sectionId: string) => {
    setActiveSection(sectionId)
    onNavigationChange?.(sectionId)
  }
  return (
    <div className="w-[70%] h-screen fixed left-0 top-0 z-10 max-lg:w-full max-lg:h-[30vh] max-lg:relative">
      <div 
        className="w-full h-full bg-cover bg-center bg-no-repeat relative flex items-center justify-center"
        style={{backgroundImage: `url(${heroImage})`}}
      >
        {/* Dark overlay */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-black/70 to-black/40 z-10" />
        
        {/* TOP LEFT - Club Name */}
        <div className="absolute top-8 left-8 z-30 max-lg:top-4 max-lg:left-4">
          <h1 
            className="text-2xl font-bold text-white tracking-widest drop-shadow-lg max-lg:text-xl"
            style={{fontFamily: "'Vina Sans', sans-serif"}}
          >
            NEXUS CLUB
          </h1>
        </div>

        {/* TOP RIGHT - Navigation & Get Tickets */}
        <div className="absolute top-8 right-8 z-30 flex flex-col items-end gap-4 max-lg:top-4 max-lg:right-4">
          {/* Navigation */}
          <nav className="flex gap-6 max-lg:gap-3">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`text-white hover:text-blue-300 transition-colors duration-200 font-medium tracking-wide ${
                  activeSection === item.id ? 'text-blue-300 border-b border-blue-300' : ''
                } max-lg:text-sm`}
                style={{fontFamily: "'Inter', sans-serif"}}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <ShinyButton className="bg-white text-black px-6 py-2 rounded-full font-semibold tracking-wide hover:bg-gray-100 hover:text-gray-900 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 max-lg:px-4 max-lg:py-1.5 max-lg:text-sm flex items-center gap-2"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            Get Tickets
            <i className="fas fa-external-link-alt text-sm max-lg:text-xs ml-2"></i>
          </ShinyButton>
        </div>

        {/* BOTTOM LEFT - Party Catchphrase */}
        <div className="absolute bottom-8 left-8 z-30 max-w-sm max-lg:bottom-4 max-lg:left-4 max-lg:max-w-xs max-lg:hidden">
          <p 
            className="text-white/90 text-lg italic leading-relaxed drop-shadow-md max-lg:text-base"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            "Where beats drop and souls connect - one night, infinite memories"
          </p>
        </div>

        {/* BOTTOM RIGHT - Countdown Timer */}
        <div className="absolute bottom-8 right-8 z-30 max-lg:bottom-4 max-lg:right-4">
          <div className="bg-black/50 backdrop-blur-sm border border-white/20 rounded-lg p-4 max-lg:p-3">
            <p 
              className="text-white/80 text-xs uppercase tracking-widest mb-2 text-center"
              style={{fontFamily: "'Inter', sans-serif"}}
            >
              Party Starts In
            </p>
            <div className="flex gap-4 max-lg:gap-2">
              <div className="text-center">
                <div 
                  className="text-2xl font-bold text-white max-lg:text-xl"
                  style={{fontFamily: "'Vina Sans', sans-serif"}}
                >
                  {timeLeft.days.toString().padStart(2, '0')}
                </div>
                <div 
                  className="text-xs text-white/70 uppercase tracking-wide"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  Days
                </div>
              </div>
              <div className="text-white/50 text-2xl font-bold max-lg:text-xl">:</div>
              <div className="text-center">
                <div 
                  className="text-2xl font-bold text-white max-lg:text-xl"
                  style={{fontFamily: "'Vina Sans', sans-serif"}}
                >
                  {timeLeft.hours.toString().padStart(2, '0')}
                </div>
                <div 
                  className="text-xs text-white/70 uppercase tracking-wide"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  Hours
                </div>
              </div>
              <div className="text-white/50 text-2xl font-bold max-lg:text-xl">:</div>
              <div className="text-center">
                <div 
                  className="text-2xl font-bold text-white max-lg:text-xl"
                  style={{fontFamily: "'Vina Sans', sans-serif"}}
                >
                  {timeLeft.minutes.toString().padStart(2, '0')}
                </div>
                <div 
                  className="text-xs text-white/70 uppercase tracking-wide"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  Min
                </div>
              </div>
              <div className="text-white/50 text-2xl font-bold max-lg:text-xl">:</div>
              <div className="text-center">
                <div 
                  className="text-2xl font-bold text-white max-lg:text-xl"
                  style={{fontFamily: "'Vina Sans', sans-serif"}}
                >
                  {timeLeft.seconds.toString().padStart(2, '0')}
                </div>
                <div 
                  className="text-xs text-white/70 uppercase tracking-wide"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  Sec
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Hero content */}
        <div className="relative z-20 text-center text-white max-w-[100%] mx-auto">
          <div className="w-full py-8 overflow-hidden">
            <Marquee speed={100} pauseOnHover={true}>
              <span 
                className="text-[28rem] font-normal text-white drop-shadow-[4px_4px_8px_rgba(0,0,0,0.7)] mr-16 bg-gradient-to-br from-white to-gray-200 bg-clip-text text-transparent inline-block max-lg:text-[6rem] max-md:text-[4rem] max-sm:text-[3rem]"
                style={{fontFamily: "'Vina Sans', sans-serif"}}
              >
                YOU'RE INVITED
              </span>
            </Marquee>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Hero

