import React from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button.jsx'
import { ElegantCard, ElegantCardTitle, ElegantCardContent } from './ui/card-elegant'

const Pricing = () => {
  const packages = [
    {
      name: "Essential",
      price: "$45",
      description: "Perfect for first-time participants",
      features: [
        "2-hour sunrise yoga session",
        "Professional instruction",
        "Welcome herbal tea",
        "Shared yoga mat provided",
        "Group photo session",
        "Digital yoga flow guide"
      ],
      highlight: false,
      buttonText: "Book Essential"
    },
    {
      name: "Premium",
      price: "$75",
      description: "Enhanced experience with luxury amenities",
      features: [
        "Everything in Essential",
        "Premium yoga mat (yours to keep)",
        "Wellness gift bag",
        "Post-session fresh juice",
        "20% spa discount",
        "Priority booking for future events",
        "Individual photo session"
      ],
      highlight: true,
      buttonText: "Book Premium"
    },
    {
      name: "VIP",
      price: "$125",
      description: "Ultimate luxury yoga experience",
      features: [
        "Everything in Premium",
        "Private changing room access",
        "Personal towel service",
        "Organic breakfast included",
        "Complimentary pool access",
        "One-on-one session with instructor",
        "Luxury amenity kit",
        "Professional photo package"
      ],
      highlight: false,
      buttonText: "Book VIP"
    }
  ]

  const groupDiscounts = [
    { size: "2-3 people", discount: "10% off" },
    { size: "4-6 people", discount: "15% off" },
    { size: "7+ people", discount: "20% off" }
  ]

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-amber-50 to-orange-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-medium text-gray-900 mb-6 font-lustria">
            Packages & Pricing
          </h2>
          <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto font-satoshi">
            Choose the perfect package for your sunrise yoga experience. All packages include the core session plus additional amenities.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {packages.map((pkg, index) => (
            <ElegantCard
              key={pkg.name}
              delay={index * 0.2}
              className={`relative p-8 ${
                pkg.highlight ? 'ring-2 ring-orange-400 scale-105' : ''
              }`}
              variant={pkg.highlight ? 'peach' : 'default'}
            >
              {pkg.highlight && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-gray-900 text-white px-6 py-2 border border-gray-300 text-sm font-semibold font-satoshi">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-8">
                <ElegantCardTitle className="text-2xl font-bold mb-2">
                  {pkg.name}
                </ElegantCardTitle>
                <p className="text-gray-600 font-satoshi mb-4">
                  {pkg.description}
                </p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-gray-900 font-lustria">
                    {pkg.price}
                  </span>
                  <span className="text-gray-600 font-satoshi"> per person</span>
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                {pkg.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span className="text-gray-700 font-satoshi">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                className={`w-full py-3 font-satoshi transition-all duration-300 border border-gray-300 ${
                  pkg.highlight 
                    ? 'bg-orange-100 hover:bg-orange-200 text-gray-900' 
                    : 'bg-gray-900 hover:bg-gray-800 text-white'
                }`}
              >
                {pkg.buttonText}
              </Button>
            </ElegantCard>
          ))}
        </div>

        {/* Group Discounts */}
        <ElegantCard
          delay={0.6}
          className="p-8 md:p-12"
          hover={false}
        >
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-4 font-lustria">
              Group Discounts
            </h3>
            <p className="text-gray-600 font-satoshi">
              Bring your friends and save! The more people in your group, the more you save.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {groupDiscounts.map((discount, index) => (
              <ElegantCard
                key={index}
                delay={0.7 + (index * 0.1)}
                variant="peach"
                className="p-6 text-center"
              >
                <div className="w-16 h-16 bg-gray-900 border-2 border-gray-300 flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-xl font-satoshi">
                    {discount.discount.split(' ')[0]}
                  </span>
                </div>
                <ElegantCardTitle className="mb-2">
                  {discount.size}
                </ElegantCardTitle>
                <ElegantCardContent>
                  <p className="text-gray-600 font-satoshi">
                    {discount.discount}
                  </p>
                </ElegantCardContent>
              </ElegantCard>
            ))}
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600 font-satoshi mb-4">
              Group discounts apply automatically when booking multiple spots. Contact us for groups of 10 or more.
            </p>
            <Button className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 border border-gray-300 font-satoshi">
              Book for Group
            </Button>
          </div>
        </ElegantCard>

        {/* Additional Information */}
        <ElegantCard
          delay={0.8}
          variant="accent"
          className="mt-12 p-6 text-center inline-block mx-auto"
          hover={false}
        >
          <p className="text-gray-800 font-satoshi">
            <span className="font-semibold">Early Bird Special:</span> Book 2 weeks in advance and save 15% on any package
          </p>
        </ElegantCard>
      </div>
    </section>
  )
}

export default Pricing