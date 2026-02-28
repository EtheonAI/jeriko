import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const FAQ = () => {
  const [openItems, setOpenItems] = useState(new Set())

  const toggleItem = (index) => {
    const newOpenItems = new Set(openItems)
    if (newOpenItems.has(index)) {
      newOpenItems.delete(index)
    } else {
      newOpenItems.add(index)
    }
    setOpenItems(newOpenItems)
  }

  const faqs = [
    {
      category: "Weather & Logistics",
      questions: [
        {
          question: "What happens if it rains?",
          answer: "We have a beautiful indoor studio space with floor-to-ceiling windows as our backup location. You'll still enjoy city views while staying dry and comfortable. We monitor weather closely and notify participants 24 hours in advance if we need to move indoors."
        },
        {
          question: "Is parking available?",
          answer: "Yes! The Skyline Hotel offers complimentary valet parking for all yoga session participants. Simply mention you're attending the sunrise yoga when you arrive. Self-parking is also available in the hotel garage at no charge."
        },
        {
          question: "How early should I arrive?",
          answer: "Please arrive 15 minutes before the scheduled start time (6:15 AM for a 6:30 AM session). This allows time for check-in, mat setup, and a brief welcome orientation. Late arrivals may miss the meditation portion."
        }
      ]
    },
    {
      category: "Booking & Payments",
      questions: [
        {
          question: "What's your refund policy?",
          answer: "Full refunds are available up to 48 hours before the session. Between 24-48 hours, we offer a 50% refund or full credit toward a future session. Within 24 hours, we provide session credit only, except for weather cancellations which receive full refunds."
        },
        {
          question: "Can I change my booking date?",
          answer: "Yes! You can reschedule your booking up to 24 hours in advance at no additional cost, subject to availability. Changes can be made through our website, by phone, or via WhatsApp."
        },
        {
          question: "Do you offer gift certificates?",
          answer: "Absolutely! Gift certificates are available for all package types and make perfect presents for yoga enthusiasts. They're valid for 6 months from purchase date and can be redeemed for any available session."
        }
      ]
    },
    {
      category: "Experience Details",
      questions: [
        {
          question: "What if I'm a complete beginner?",
          answer: "You're very welcome! Our sessions are designed for all levels, and Sarah provides modifications for every pose. We also offer brief individual guidance before the session starts for first-timers. Many of our regular participants started as complete beginners."
        },
        {
          question: "Is the session heated?",
          answer: "No, this is not a heated yoga session. We practice in the natural outdoor environment (or climate-controlled indoor space if weather requires). The early morning temperature is usually perfect for gentle movement."
        },
        {
          question: "Can I bring my own yoga mat?",
          answer: "Definitely! While we provide high-quality mats for all participants, you're welcome to bring your own if you prefer. Just let us know when booking if you'll be bringing your own mat."
        },
        {
          question: "Is food provided?",
          answer: "All packages include a welcome herbal tea. Premium and VIP packages include post-session refreshments. The VIP package includes a full organic breakfast. Additional food and beverages are available for purchase at the hotel restaurant."
        }
      ]
    },
    {
      category: "Health & Safety",
      questions: [
        {
          question: "Are there age restrictions?",
          answer: "Participants must be 16 or older. Those under 18 need parent/guardian consent. We recommend consulting with your doctor if you have any health concerns about participating in physical activity."
        },
        {
          question: "What if I have injuries or limitations?",
          answer: "Please inform us about any injuries or physical limitations when booking. Sarah is experienced in providing modifications and alternative poses. We want everyone to feel comfortable and safe during the practice."
        },
        {
          question: "Is the rooftop deck safe?",
          answer: "Absolutely! The rooftop deck features secure railings, non-slip surfaces, and is regularly inspected for safety. We also have first aid trained staff present at all sessions."
        }
      ]
    }
  ]

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium text-gray-900 mb-6 font-lustria">
            Frequently Asked Questions
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Everything you need to know about your sunrise yoga experience. Can't find your answer? We're here to help!
          </p>
        </motion.div>

        <div className="space-y-8">
          {faqs.map((category, categoryIndex) => (
            <motion.div
              key={categoryIndex}
              initial={{ y: 50, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: categoryIndex * 0.1 }}
              viewport={{ once: true }}
            >
              <h3 className="text-xl font-semibold text-gray-900 mb-6 font-lustria text-center">
                {category.category}
              </h3>
              
              <div className="space-y-4">
                {category.questions.map((faq, questionIndex) => {
                  const globalIndex = categoryIndex * 1000 + questionIndex
                  const isOpen = openItems.has(globalIndex)
                  
                  return (
                    <motion.div
                      key={questionIndex}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: questionIndex * 0.1 }}
                      viewport={{ once: true }}
                      className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl overflow-hidden"
                    >
                      <button
                        onClick={() => toggleItem(globalIndex)}
                        className="w-full p-6 text-left flex items-center justify-between hover:bg-orange-100 transition-colors duration-200"
                      >
                        <span className="font-semibold text-gray-900 font-satoshi pr-4">
                          {faq.question}
                        </span>
                        <motion.svg
                          animate={{ rotate: isOpen ? 45 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="w-6 h-6 text-orange-600 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </motion.svg>
                      </button>
                      
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="px-6 pb-6">
                              <div className="border-t border-orange-200 pt-4">
                                <p className="text-gray-700 font-satoshi leading-relaxed">
                                  {faq.answer}
                                </p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Still Have Questions */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
        </motion.div>
      </div>
    </section>
  )
}

export default FAQ