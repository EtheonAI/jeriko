import React from 'react'
import { motion } from 'framer-motion'
import { ElegantCard, ElegantCardIcon, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'

const Schedule = () => {
  const scheduleItems = [
    {
      time: "6:15 AM",
      title: "Arrival & Check-in",
      description: "Welcome drink and mat setup on the rooftop deck",
      duration: "15 min",
      icon: "🏨"
    },
    {
      time: "6:30 AM",
      title: "Sunrise Meditation",
      description: "Gentle breathing exercises as we watch the sunrise",
      duration: "15 min",
      icon: "🧘‍♀️"
    },
    {
      time: "6:45 AM",
      title: "Morning Flow Sequence",
      description: "Energizing vinyasa flow to awaken the body",
      duration: "45 min",
      icon: "🤸‍♀️"
    },
    {
      time: "7:30 AM",
      title: "Cool-down & Relaxation",
      description: "Restorative poses and final meditation",
      duration: "15 min",
      icon: "🕯️"
    },
    {
      time: "7:45 AM",
      title: "Closing Circle",
      description: "Sharing gratitude and intention setting",
      duration: "15 min",
      icon: "🤝"
    },
    {
      time: "8:00 AM",
      title: "Optional Hotel Brunch",
      description: "Healthy breakfast at the hotel restaurant (additional cost)",
      duration: "45 min",
      icon: "🥐",
      optional: true
    }
  ]

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
            Schedule
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            A carefully crafted morning experience designed to energize your body and calm your mind.
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          {scheduleItems.map((item, index) => (
            <motion.div
              key={index}
              initial={{ x: index % 2 === 0 ? -50 : 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className={`relative flex items-start mb-8 ${item.optional ? 'opacity-80' : ''}`}
            >
              {/* Timeline line */}
              {index < scheduleItems.length - 1 && (
                <div className="absolute left-6 top-16 w-0.5 h-16 bg-gradient-to-b from-orange-300 to-amber-300"></div>
              )}
              
              {/* Time circle */}
              <ElegantCardIcon 
                variant={item.optional ? "default" : "peach"} 
                className="flex-shrink-0 mr-6"
              >
                <span className="text-xl">{item.icon}</span>
              </ElegantCardIcon>

              {/* Content */}
              <ElegantCard variant="peach" className="flex-1" hover={false}>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
                  <div className="flex items-center mb-2 md:mb-0">
                    <span className="text-sm font-semibold text-orange-800 bg-orange-100 px-3 py-1 border border-gray-300 mr-3 font-satoshi">
                      {item.time}
                    </span>
                    <span className="text-xs text-gray-500 font-satoshi">
                      {item.duration}
                    </span>
                    {item.optional && (
                      <span className="text-xs text-gray-500 bg-gray-100 border border-gray-300 px-2 py-1 ml-2 font-satoshi">
                        Optional
                      </span>
                    )}
                  </div>
                </div>
                <ElegantCardTitle className="mb-2">
                  {item.title}
                </ElegantCardTitle>
                <ElegantCardContent>
                  <p className="text-gray-600 font-satoshi">
                    {item.description}
                  </p>
                </ElegantCardContent>
              </ElegantCard>
            </motion.div>
          ))}
        </div>

        {/* Additional Info */}
        <ElegantCard
          delay={0.8}
          variant="accent"
          className="mt-16 p-8 text-center"
          hover={false}
        >
          <h3 className="text-2xl font-medium text-gray-900 mb-4 font-lustria">
            Perfect Timing
          </h3>
          <p className="text-gray-600 font-satoshi mb-6 max-w-2xl mx-auto">
            Our schedule is designed to capture the magical golden hour of sunrise while allowing 
            you to complete your practice before the city fully awakens. The timing ensures you'll 
            have the most serene and photogenic experience possible.
          </p>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div className="flex items-center justify-center space-x-2 text-gray-700">
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span className="font-satoshi">Total Duration: 2 hours</span>
            </div>
            <div className="flex items-center justify-center space-x-2 text-gray-700">
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span className="font-satoshi">Best sunrise views</span>
            </div>
            <div className="flex items-center justify-center space-x-2 text-gray-700">
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              <span className="font-satoshi">Small group size (max 20)</span>
            </div>
          </div>
        </ElegantCard>
      </div>
    </section>
  )
}

export default Schedule