import React from 'react'
import { motion } from 'framer-motion'
import { ElegantCard, ElegantCardIcon, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'

const WhatToBring = () => {
  const essentialItems = [
    {
      item: "Comfortable Yoga Attire",
      description: "Breathable, stretchy clothing that allows for full range of motion",
      icon: "👕",
      provided: false
    },
    {
      item: "Water Bottle",
      description: "Stay hydrated throughout the session (filtered water stations available)",
      icon: "💧",
      provided: false
    },
    {
      item: "Yoga Mat",
      description: "We provide mats, but you're welcome to bring your own",
      icon: "🧘‍♀️",
      provided: true
    },
    {
      item: "Light Jacket or Wrap",
      description: "Early morning can be cool; easy to remove as you warm up",
      icon: "🧥",
      provided: false
    },
    {
      item: "Towel",
      description: "For wiping sweat or extra comfort (VIP packages include towel service)",
      icon: "🏖️",
      provided: "vip"
    },
    {
      item: "Positive Energy",
      description: "Come with an open mind and ready to embrace the experience",
      icon: "✨",
      provided: false,
      essential: true
    }
  ]

  const healthConsiderations = [
    {
      title: "Medical Conditions",
      description: "Please inform us of any injuries, medical conditions, or physical limitations",
      icon: "🏥"
    },
    {
      title: "Pregnancy",
      description: "We welcome expecting mothers with modified poses (please notify us in advance)",
      icon: "🤱"
    },
    {
      title: "Fitness Level",
      description: "All levels welcome - modifications provided for every pose",
      icon: "💪"
    },
    {
      title: "Age Requirements",
      description: "Participants must be 16+ (under 18 requires parent/guardian consent)",
      icon: "🎂"
    }
  ]

  const dressCode = [
    {
      do: "Wear breathable, moisture-wicking fabrics",
      dont: "Avoid cotton clothing that retains sweat"
    },
    {
      do: "Choose form-fitting but comfortable attire",
      dont: "Avoid loose clothing that may interfere with poses"
    },
    {
      do: "Dress in layers for temperature changes",
      dont: "Avoid heavy or restrictive outerwear"
    },
    {
      do: "Wear comfortable athletic shoes (removed for practice)",
      dont: "Avoid flip-flops or unsecured footwear"
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
            What to Bring & Prepare
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Everything you need to know to prepare for your perfect sunrise yoga experience.
          </p>
        </motion.div>

        {/* Essential Items */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Essential Items Checklist
          </h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {essentialItems.map((item, index) => (
              <ElegantCard
                key={index}
                delay={index * 0.1}
                className={`${item.essential ? 'ring-2 ring-orange-400' : ''}`}
                variant={item.essential ? 'peach' : 'default'}
              >
                <div className="flex items-start space-x-4">
                  <ElegantCardIcon variant="peach">
                    <span className="text-2xl">{item.icon}</span>
                  </ElegantCardIcon>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <ElegantCardTitle className="text-base">
                        {item.item}
                      </ElegantCardTitle>
                      {item.provided === true && (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 border border-gray-300 font-satoshi">
                          Provided
                        </span>
                      )}
                      {item.provided === "vip" && (
                        <span className="text-xs bg-gray-800 text-white px-2 py-1 border border-gray-300 font-satoshi">
                          VIP Only
                        </span>
                      )}
                      {item.essential && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 border border-gray-300 font-satoshi">
                          Essential
                        </span>
                      )}
                    </div>
                    <ElegantCardContent>
                      <p className="text-sm text-gray-600 font-satoshi">
                        {item.description}
                      </p>
                    </ElegantCardContent>
                  </div>
                </div>
              </ElegantCard>
            ))}
          </div>
        </motion.div>

        {/* Dress Code */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Dress Code Guidelines
          </h3>
          
          <ElegantCard variant="accent" className="p-8" hover={false}>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-xl font-semibold text-gray-900 mb-4 font-satoshi flex items-center">
                  <svg className="w-6 h-6 mr-2 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Do
                </h4>
                <ul className="space-y-3">
                  {dressCode.map((item, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <svg className="w-4 h-4 text-gray-700 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700 font-satoshi">{item.do}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-semibold text-gray-900 mb-4 font-satoshi flex items-center">
                  <svg className="w-6 h-6 mr-2 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Don't
                </h4>
                <ul className="space-y-3">
                  {dressCode.map((item, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <svg className="w-4 h-4 text-gray-700 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span className="text-gray-700 font-satoshi">{item.dont}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </ElegantCard>
        </motion.div>

        {/* Health Considerations */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          viewport={{ once: true }}
        >
          <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-8 text-center font-lustria">
            Health & Safety Considerations
          </h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {healthConsiderations.map((item, index) => (
              <ElegantCard
                key={index}
                delay={index * 0.1}
                className="p-6 text-center"
              >
                <ElegantCardIcon variant="default" className="mx-auto mb-4">
                  <span className="text-2xl">{item.icon}</span>
                </ElegantCardIcon>
                <ElegantCardTitle className="mb-3 text-base">
                  {item.title}
                </ElegantCardTitle>
                <ElegantCardContent>
                  <p className="text-sm text-gray-600 font-satoshi leading-relaxed">
                    {item.description}
                  </p>
                </ElegantCardContent>
              </ElegantCard>
            ))}
          </div>
        </motion.div>

        {/* Important Notice */}
        <ElegantCard
          delay={0.8}
          variant="accent"
          className="mt-16 p-6"
          hover={false}
        >
          <div className="flex items-start space-x-4">
            <ElegantCardIcon variant="dark" className="flex-shrink-0">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </ElegantCardIcon>
            <div>
              <ElegantCardTitle className="mb-2">
                Important Preparation Note
              </ElegantCardTitle>
              <ElegantCardContent>
                <p className="text-gray-700 font-satoshi">
                  Please arrive 15 minutes early for check-in and setup. Avoid heavy meals 2 hours before the session. 
                  If you have any concerns about participating, please consult with our instructor before the class begins.
                </p>
              </ElegantCardContent>
            </div>
          </div>
        </ElegantCard>
      </div>
    </section>
  )
}

export default WhatToBring