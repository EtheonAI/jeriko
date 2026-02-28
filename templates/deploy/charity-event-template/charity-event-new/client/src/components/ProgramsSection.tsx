import { useEffect, useRef } from 'react'
import { annotate } from 'rough-notation'
import { Button } from '@/components/ui/button'
import emergencyFoodBoxImage from '../assets/images/emergency-food-box.webp'
import childrenEatingImage from '../assets/images/children-eating.webp'
import foodDistributionImage from '../assets/images/food-distribution.webp'

interface ProgramCardProps {
  image: string
  title: string
  description: string
  goal: string
}

const ProgramCard = ({ image, title, description, goal }: ProgramCardProps) => {
  return (
    <div className="bg-gray-50 rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300 relative">
      <div className="h-64 overflow-hidden relative">
        <img 
          src={image} 
          alt={title} 
          className="w-full h-full object-cover hover:scale-110 transition-transform duration-500 ease-in-out"
        />
        <div className="absolute top-4 right-4 bg-yellow-400 text-gray-800 px-3 py-1 rounded-lg text-sm font-semibold">
          Goal: {goal}
        </div>
      </div>
      <div className="p-8">
        <h3 className="text-2xl font-bold mb-4 text-gray-800">
          {title}
        </h3>
        <p className="text-gray-600 mb-8 leading-relaxed">
          {description}
        </p>
        <Button className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium inline-flex items-center gap-2">
          Learn More 
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Button>
      </div>
    </div>
  )
}

const ProgramsSection = () => {
  const foodProgramsRef = useRef<HTMLSpanElement>(null)
  const makingDifferenceRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (foodProgramsRef.current) {
      const annotation = annotate(foodProgramsRef.current, { 
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      })
      
      const timer1 = setTimeout(() => {
        annotation.show()
      }, 1000)

      return () => clearTimeout(timer1)
    }
  }, [])

  useEffect(() => {
    if (makingDifferenceRef.current) {
      const annotation = annotate(makingDifferenceRef.current, { 
        type: 'underline',
        color: '#f59e0b', // amber-500 color
        animationDuration: 1000
      })
      
      const timer2 = setTimeout(() => {
        annotation.show()
      }, 1700)

      return () => clearTimeout(timer2)
    }
  }, [])

  const programs = [
    {
      image: emergencyFoodBoxImage,
      title: "Emergency Food Boxes",
      description: "We provide emergency food assistance to families facing immediate hunger with nutritious, ready-to-use food packages.",
      goal: "$25,000"
    },
    {
      image: childrenEatingImage,
      title: "School Backpack Program",
      description: "We ensure children don't go hungry on weekends by providing backpacks filled with kid-friendly, nutritious meals.",
      goal: "$15,000"
    },
    {
      image: foodDistributionImage,
      title: "Senior Food Delivery",
      description: "We deliver fresh groceries and prepared meals to homebound seniors who struggle with food access.",
      goal: "$20,000"
    }
  ]

  return (
    <section id="programs" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-800 mb-4">
            <span ref={foodProgramsRef}>Our Food Programs</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover how we're <span ref={makingDifferenceRef}>making a difference</span> in our community through targeted food assistance programs
          </p>
        </div>

        {/* Program Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {programs.map((program, index) => (
            <ProgramCard key={index} {...program} />
          ))}
        </div>

        {/* View All Button */}
        <div className="text-center">
          <Button className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-lg font-medium inline-flex items-center gap-2">
            View All Programs
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </section>
  )
}

export default ProgramsSection

