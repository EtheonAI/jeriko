import React from 'react'
import { motion } from 'framer-motion'
import { ElegantCard, ElegantCardIcon, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'

const AboutEvent = () => {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium text-gray-900 mb-6 font-lustria">
            About the Event
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Experience the magic of sunrise yoga in an extraordinary setting that combines luxury, serenity, and breathtaking views.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Content */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="space-y-8">
              <div>
                <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-4 font-lustria">
                  What Makes It Special
                </h3>
                <p className="text-gray-600 font-satoshi leading-relaxed">
                  Join us on the rooftop deck of the prestigious Skyline Hotel for a transformative yoga experience. 
                  As the sun rises over the city skyline, you'll flow through gentle movements while being surrounded 
                  by panoramic views that create the perfect backdrop for mindfulness and connection.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ElegantCard delay={0.3} className="h-full">
                  <ElegantCardIcon variant="peach">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 2L3 7v11a2 2 0 002 2h10a2 2 0 002-2V7l-7-5zM10 18a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </ElegantCardIcon>
                  <ElegantCardTitle className="mb-2">Luxury Setting</ElegantCardTitle>
                  <ElegantCardContent>
                    <p className="text-sm text-gray-600 font-satoshi">5-star hotel rooftop with premium amenities</p>
                  </ElegantCardContent>
                </ElegantCard>

                <ElegantCard delay={0.4} className="h-full">
                  <ElegantCardIcon variant="default">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </ElegantCardIcon>
                  <ElegantCardTitle className="mb-2">All Levels Welcome</ElegantCardTitle>
                  <ElegantCardContent>
                    <p className="text-sm text-gray-600 font-satoshi">Suitable for beginners to advanced practitioners</p>
                  </ElegantCardContent>
                </ElegantCard>
              </div>
            </div>
          </motion.div>

          {/* Right Content - Instructor Bio */}
          <ElegantCard 
            delay={0.5} 
            variant="accent" 
            className="p-8"
            hover={false}
          >
            <div className="flex items-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center text-white font-bold text-xl mr-6">
                S
              </div>
              <div>
                <h3 className="text-2xl font-medium text-gray-900 font-lustria">Sarah Chen</h3>
                <p className="text-gray-600 font-satoshi">Lead Yoga Instructor</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-gray-600 font-satoshi leading-relaxed">
                With over 8 years of experience and 500+ hour certification in Hatha and Vinyasa yoga, 
                Sarah specializes in sunrise flow sequences that energize the body and calm the mind.
              </p>
              
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-600 font-satoshi">
                  <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  RYT-500 Certified Instructor
                </div>
                <div className="flex items-center text-sm text-gray-600 font-satoshi">
                  <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Meditation & Mindfulness Specialist
                </div>
                <div className="flex items-center text-sm text-gray-600 font-satoshi">
                  <svg className="w-4 h-4 mr-2 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Featured in Yoga Journal Magazine
                </div>
              </div>
            </div>
          </ElegantCard>
        </div>
      </div>
    </section>
  )
}

export default AboutEvent