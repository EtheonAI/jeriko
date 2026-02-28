import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { ElegantCard, ElegantCardIcon, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faInstagram, faFacebook, faYoutube } from '@fortawesome/free-brands-svg-icons'

const BookingContact = () => {
  const contactMethods = [
    {
      type: "Phone",
      value: "+1 (555) 123-YOGA",
      icon: "📞",
      description: "Call us directly for immediate booking assistance",
      available: "Mon-Sun 7AM-8PM"
    },
    {
      type: "Email",
      value: "hello@skylineyoga.com",
      icon: "📧",
      description: "Send us your questions or booking requests",
      available: "Response within 2 hours"
    },
    {
      type: "WhatsApp",
      value: "+1 (555) 123-YOGA",
      icon: "💬",
      description: "Quick chat for instant responses",
      available: "Available 24/7"
    }
  ]

  const socialLinks = [
    {
      platform: "Instagram",
      handle: "@skylineyoga",
      icon: faInstagram,
      description: "Follow our daily inspiration and behind-the-scenes content"
    },
    {
      platform: "Facebook",
      handle: "Skyline Yoga Events",
      icon: faFacebook,
      description: "Join our community for event updates and discussions"
    },
    {
      platform: "YouTube",
      handle: "Skyline Yoga",
      icon: faYoutube,
      description: "Watch session highlights and preparation videos"
    }
  ]

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-amber-50 to-orange-50">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium text-gray-900 mb-6 font-lustria">
            Booking & Contact
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Ready to join us for an unforgettable sunrise yoga experience? We're here to help you every step of the way.
          </p>
        </motion.div>

        {/* Quick Action Buttons */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-6 mb-4"
        >
        </motion.div>

        {/* Contact Methods */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Get in Touch
          </h3>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {contactMethods.map((method, index) => (
              <ElegantCard
                key={index}
                delay={index * 0.1}
                className="p-8 text-center"
              >
                <ElegantCardIcon variant="peach" className="mx-auto mb-4">
                  <span className="text-2xl">{method.icon}</span>
                </ElegantCardIcon>
                <ElegantCardTitle className="mb-2">
                  {method.type}
                </ElegantCardTitle>
                <p className="text-lg text-orange-800 font-semibold mb-3 font-satoshi">
                  {method.value}
                </p>
                <ElegantCardContent>
                  <p className="text-gray-600 text-sm mb-3 font-satoshi">
                    {method.description}
                  </p>
                  <span className="inline-block bg-orange-100 text-orange-800 text-xs px-3 py-1 border border-gray-300 font-satoshi">
                    {method.available}
                  </span>
                </ElegantCardContent>
              </ElegantCard>
            ))}
          </div>
        </motion.div>

        {/* WhatsApp Quick Chat */}
        <ElegantCard
          delay={0.6}
          variant="dark"
          className="mb-16 p-8 text-center"
          hover={false}
        >
          <div className="text-white">
            <div className="text-5xl mb-4">💬</div>
            <h3 className="text-2xl font-semibold mb-4 font-lustria">
              WhatsApp Quick Chat
            </h3>
            <p className="text-gray-300 mb-6 font-satoshi max-w-2xl mx-auto">
              Get instant answers to your questions! Our team is available 24/7 to help with bookings, 
              answer questions about the experience, or provide any assistance you need.
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button className="bg-white text-gray-900 hover:bg-gray-100 px-8 py-3 border border-gray-300 font-satoshi font-semibold">
                Start WhatsApp Chat
              </Button>
            </motion.div>
          </div>
        </ElegantCard>

        {/* Social Media */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Follow Our Journey
          </h3>
          
          <div className="grid md:grid-cols-3 gap-6">
            {socialLinks.map((social, index) => (
              <ElegantCard
                key={index}
                delay={index * 0.1}
                className="p-6"
              >
                <div className="flex items-center mb-4">
                  <ElegantCardIcon variant="default" className="mr-4">
                    <FontAwesomeIcon icon={social.icon} className="text-lg" />
                  </ElegantCardIcon>
                  <div>
                    <ElegantCardTitle className="text-base">
                      {social.platform}
                    </ElegantCardTitle>
                    <p className="text-orange-800 font-satoshi">
                      {social.handle}
                    </p>
                  </div>
                </div>
                <ElegantCardContent>
                  <p className="text-gray-600 text-sm font-satoshi">
                    {social.description}
                  </p>
                </ElegantCardContent>
              </ElegantCard>
            ))}
          </div>
        </motion.div>

        {/* Location & Hours */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 1 }}
          viewport={{ once: true }}
          className="grid lg:grid-cols-2 gap-12"
        >
          <ElegantCard className="p-8" hover={false}>
            <h3 className="text-xl font-semibold text-gray-900 mb-6 font-lustria flex items-center">
              <svg className="w-6 h-6 mr-3 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Our Location
            </h3>
            <div className="space-y-3 text-gray-600 font-satoshi">
              <p className="font-semibold text-gray-900">Skyline Hotel</p>
              <p>123 Downtown Avenue<br />City Center, State 12345</p>
              <p>Rooftop Deck (25th Floor)</p>
              <div className="pt-4">
                <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 rounded-full font-satoshi text-sm">
                  Get Directions
                </Button>
              </div>
            </div>
          </ElegantCard>

          <ElegantCard className="p-8" hover={false}>
            <h3 className="text-xl font-semibold text-gray-900 mb-6 font-lustria flex items-center">
              <svg className="w-6 h-6 mr-3 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Contact Hours
            </h3>
            <div className="space-y-3 text-gray-600 font-satoshi">
              <div className="flex justify-between">
                <span>Phone Support:</span>
                <span>7:00 AM - 8:00 PM</span>
              </div>
              <div className="flex justify-between">
                <span>Email Response:</span>
                <span>Within 2 hours</span>
              </div>
              <div className="flex justify-between">
                <span>WhatsApp:</span>
                <span>24/7 Available</span>
              </div>
              <div className="flex justify-between">
                <span>Sessions:</span>
                <span>Weekends Only</span>
              </div>
            </div>
          </ElegantCard>
        </motion.div>
      </div>
    </section>
  )
}

export default BookingContact