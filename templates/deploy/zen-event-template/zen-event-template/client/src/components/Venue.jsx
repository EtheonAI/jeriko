import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { ElegantCard, ElegantCardIcon, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'

const Venue = () => {
  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-gray-50 to-amber-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium text-gray-900 mb-6 font-lustria">
            The Venue
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Experience yoga at the renowned Skyline Hotel's exclusive rooftop deck with unparalleled city views.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
          {/* Left Content */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-4 font-lustria">
                  Skyline Hotel Rooftop
                </h3>
                <p className="text-gray-600 font-satoshi leading-relaxed mb-6">
                  The 5-star Skyline Hotel is renowned for its exceptional service and breathtaking architecture. 
                  Our exclusive rooftop deck offers 360-degree views of the city, creating an unmatched setting 
                  for your yoga practice.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-gray-700 font-satoshi">5-Star Rating</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-gray-700 font-satoshi">Panoramic Views</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-gray-700 font-satoshi">Climate Controlled</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-gray-700 font-satoshi">Premium Sound</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Content - Mock Image */}
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            viewport={{ once: true }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-amber-100 to-orange-200 rounded-3xl aspect-[4/3] flex items-center justify-center">
              <div className="text-center text-gray-600">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
                <p className="font-satoshi">Rooftop Deck Photo</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Access Perks */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Exclusive Access Perks
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <ElegantCard delay={0.7} className="text-center">
              <ElegantCardIcon variant="peach" className="mx-auto">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </ElegantCardIcon>
              <ElegantCardTitle className="mb-2">Spa Discount</ElegantCardTitle>
              <ElegantCardContent>
                <p className="text-gray-600 font-satoshi">20% off spa services after your session</p>
              </ElegantCardContent>
            </ElegantCard>

            <ElegantCard delay={0.8} className="text-center">
              <ElegantCardIcon variant="default" className="mx-auto">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </ElegantCardIcon>
              <ElegantCardTitle className="mb-2">Pool Access</ElegantCardTitle>
              <ElegantCardContent>
                <p className="text-gray-600 font-satoshi">Complimentary pool access until 12 PM</p>
              </ElegantCardContent>
            </ElegantCard>

            <ElegantCard delay={0.9} className="text-center">
              <ElegantCardIcon variant="dark" className="mx-auto">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                </svg>
              </ElegantCardIcon>
              <ElegantCardTitle className="mb-2">Valet Parking</ElegantCardTitle>
              <ElegantCardContent>
                <p className="text-gray-600 font-satoshi">Complimentary valet parking included</p>
              </ElegantCardContent>
            </ElegantCard>
          </div>
        </motion.div>

        {/* Location & Transport */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          viewport={{ once: true }}
          className="grid lg:grid-cols-2 gap-12 items-center"
        >
          <div>
            <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-6 font-lustria">
              Location & Transport
            </h3>
            <div className="space-y-4 mb-6">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-gray-600 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="font-semibold text-gray-900 font-satoshi">Skyline Hotel</p>
                  <p className="text-gray-600 font-satoshi">123 Downtown Avenue, City Center</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-gray-600 mt-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                </svg>
                <div>
                  <p className="text-gray-600 font-satoshi">2 blocks from Central Station</p>
                  <p className="text-gray-600 font-satoshi">Multiple bus routes nearby</p>
                </div>
              </div>
            </div>
            <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-full font-satoshi">
              Get Directions
            </Button>
          </div>
          
          <div className="bg-gray-100 rounded-3xl aspect-[4/3] flex items-center justify-center">
            <div className="text-center text-gray-600">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <p className="font-satoshi">Interactive Map</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default Venue