import React from 'react'
import { Button } from '@/components/ui/button'
import CountUp from 'react-countup'
import Marquee from 'react-fast-marquee'

const About = () => {
  const clientLogos = [
    { name: 'TechFlow Solutions', logo: 'TF' },
    { name: 'Digital Dynamics', logo: 'DD' },
    { name: 'InnovateLab', logo: 'IL' },
    { name: 'CloudVision', logo: 'CV' },
    { name: 'NextGen Systems', logo: 'NG' },
    { name: 'DataStream Co', logo: 'DS' }
  ]

  const statistics = [
    { number: 200, suffix: '+', label: 'Projects delivered' },
    { number: 50, suffix: '+', label: 'Happy clients' },
    { number: 98, suffix: '%', label: 'Success rate' },
    { number: 24, suffix: '/7', label: 'Support available' }
  ]

  return (
    <section id="about" className="pb-8 sm:pb-16">
      {/* Client Logos */}
      <div className="px-4 sm:px-6 lg:px-8 mb-8 sm:mb-16">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-gray-600 mb-6 sm:mb-8 text-sm sm:text-base">Trusted by innovative companies worldwide</p>
          <Marquee
            gradient={true}
            gradientColor="rgb(249, 250, 251)"
            gradientWidth={30}
            speed={25}
            pauseOnHover={true}
            className="overflow-hidden"
          >
            {clientLogos.map((client, index) => (
              <div 
                key={index}
                className="mx-3 sm:mx-6 px-4 sm:px-8 py-2 sm:py-4 bg-white rounded-lg shadow-sm border border-gray-100 text-xs sm:text-sm font-semibold text-gray-700 hover:shadow-md hover:scale-105 transition-all duration-300 hover-lift whitespace-nowrap"
                title={client.name}
              >
                {client.name}
              </div>
            ))}
          </Marquee>
        </div>
      </div>
      {/* Hero Section with Background */}
      <div className="relative">
        <div 
          className="relative h-[500px] sm:h-[600px] lg:h-[700px] bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(/zN7gNXWn1K8y.webp)` }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative z-10 h-full flex items-center px-4 sm:px-8 lg:px-16">
            <div className="max-w-7xl mx-auto w-full h-full">
              <div className="flex flex-col lg:flex-row gap-8 sm:gap-12 lg:gap-20 h-full py-8 sm:py-12 lg:py-16">
                {/* Left Content */}
                <div className="flex-1 text-white flex flex-col justify-center lg:justify-start">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[72px] font-semibold mb-4 sm:mb-6 leading-tight sm:leading-tight lg:leading-[72px]" style={{ fontFamily: '"Instrument Sans", sans-serif', fontWeight: 600, color: '#fff' }}>
                    Since 2020, we've been crafting digital solutions that transform businesses
                  </h2>
                  <Button 
                    className="bg-white text-black hover:bg-gray-100 px-6 sm:px-8 py-2 sm:py-3 rounded-full font-medium transition-all duration-300 hover:scale-105 w-fit text-sm sm:text-base"
                  >
                    Our Story
                  </Button>
                </div>

                {/* Right Statistics Grid */}
                <div className="flex-1 flex flex-col justify-center lg:justify-end">
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                    {statistics.map((stat, index) => (
                      <div 
                        key={index}
                        className="bg-white/95 backdrop-blur-sm rounded-xl sm:rounded-[2rem] p-4 sm:p-6 lg:p-8 text-center shadow-xl hover:shadow-2xl hover:scale-105 transition-all duration-300"
                        style={{ animationDelay: `${index * 0.2}s` }}
                      >
                        <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-1 sm:mb-2 lg:mb-3">
                          <CountUp
                            end={stat.number}
                            duration={2.5}
                            delay={index * 0.3}
                            enableScrollSpy
                            scrollSpyOnce
                          />
                          <span>{stat.suffix}</span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 font-medium leading-tight">
                          {stat.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default About

