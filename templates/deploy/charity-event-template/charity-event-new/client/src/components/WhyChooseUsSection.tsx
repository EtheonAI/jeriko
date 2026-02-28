import { useRef } from 'react'
import { useMultipleScrollAnimations } from '@/hooks/useScrollAnimation'
import familyAssistanceImage from '../assets/images/family-assistance.webp'

interface FeatureCardProps {
  number: string
  title: string
  description: string
  icon: string
}

const FeatureCard = ({ number, title, description, icon }: FeatureCardProps) => {
  return (
    <div className="bg-gray-50 rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow duration-300 relative">
      <div className="flex items-center mb-6">
        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mr-4">
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
          <span className="text-gray-800 font-bold text-sm">{number}</span>
        </div>
      </div>
      
      <h3 className="text-2xl font-bold text-gray-800 mb-4">
        {title}
      </h3>
      
      <p className="text-gray-600 leading-relaxed">
        {description}
      </p>
    </div>
  )
}

const WhyChooseUsSection = () => {
  const supportRef = useRef(null)
  const realDifferenceRef = useRef(null)

  // Setup multiple scroll-triggered animations with staggered delays
  useMultipleScrollAnimations([
    {
      ref: supportRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 1200
    },
    {
      ref: realDifferenceRef,
      config: {
        type: 'underline',
        color: '#f59e0b', // amber-500 color
        animationDuration: 1000
      },
      delay: 1900
    }
  ])
  const features = [
    {
      number: "01",
      title: "Direct Community Impact",
      description: "100% of donations stay local, directly feeding families in our community. Every dollar donated provides 4 meals to those in need.",
      icon: "🎯"
    },
    {
      number: "02", 
      title: "Efficient Distribution",
      description: "Our streamlined process ensures donated food reaches hungry families within 48 hours, maintaining freshness and dignity.",
      icon: "⚡"
    },
    {
      number: "03",
      title: "Volunteer-Powered",
      description: "Our dedicated volunteers ensure every donation is handled with care and distributed with compassion and respect.",
      icon: "🤝"
    }
  ]

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        {/* Hero Image */}
        <div className="mb-16">
          <div className="rounded-2xl overflow-hidden shadow-2xl h-64 relative">
            <img 
              src={familyAssistanceImage} 
              alt="Families receiving food assistance" 
              className="w-full h-full object-cover hover:scale-110 transition-transform duration-500 ease-in-out"
            />
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
              <div className="text-center text-white">
                <h2 className="text-4xl lg:text-5xl font-bold mb-4">
                  Why <span ref={supportRef} className="text-white">Support</span> Our Food Drive?
                </h2>
                <p className="text-xl opacity-90">
                  Making a <span ref={realDifferenceRef} className="text-yellow-400">real difference</span> in our community
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>

        {/* Bottom Stats */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-2 bg-gray-50 rounded-full px-6 py-3 shadow-md border border-gray-200">
            <div className="flex -space-x-2">
              <div className="w-8 h-8 bg-gray-300 rounded-full border-2 border-white"></div>
              <div className="w-8 h-8 bg-gray-400 rounded-full border-2 border-white"></div>
              <div className="w-8 h-8 bg-gray-500 rounded-full border-2 border-white"></div>
              <div className="w-8 h-8 bg-yellow-400 rounded-full border-2 border-white"></div>
            </div>
            <span className="text-gray-700 font-semibold">Over 500+ Families Served</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default WhyChooseUsSection

