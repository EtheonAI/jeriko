import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { useMultipleScrollAnimations } from '@/hooks/useScrollAnimation'
import volunteersSortingImage from '../assets/images/volunteers-sorting.webp'

const VolunteerSection = () => {
  const volunteerRef = useRef(null)
  const passionateVolunteersRef = useRef(null)
  const fightHungerRef = useRef(null)

  // Setup multiple scroll-triggered animations with staggered delays
  useMultipleScrollAnimations([
    {
      ref: volunteerRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 1000
    },
    {
      ref: passionateVolunteersRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 1800
    },
    {
      ref: fightHungerRef,
      config: {
        type: 'underline',
        color: '#f59e0b', // amber-500 color
        animationDuration: 1000
      },
      delay: 2500
    }
  ])

  return (
    <section id="volunteers" className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div>
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-800 mb-6 leading-tight">
              Become a{' '}
              <span ref={volunteerRef} className="block text-amber-800">Food Drive Volunteer</span>
            </h2>
            
            <p className="text-lg text-gray-700 mb-8 leading-relaxed">
              Your time and energy can help <span ref={fightHungerRef} className="text-amber-800">fight hunger</span> in our community. Join our network of{' '}
              <span ref={passionateVolunteersRef} className="text-amber-800">passionate volunteers</span> and be part of the solution to food insecurity.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Sort and pack food donations</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Distribute meals to families</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Help with community outreach</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <span className="text-gray-700">Support special events and drives</span>
              </div>
            </div>

            <Button className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-4 rounded-lg text-lg font-medium inline-flex items-center gap-2 shadow-lg hover:shadow-xl transition-all duration-300">
              Volunteer Today
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>

          {/* Right Image */}
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl">
              <img 
                src={volunteersSortingImage} 
                alt="Volunteers sorting and organizing food donations" 
                className="w-full h-96 object-cover hover:scale-110 transition-transform duration-500 ease-in-out"
              />
            </div>
            
            {/* Floating Stats Cards */}
            <div className="absolute -top-6 -left-6 bg-gray-50 rounded-lg shadow-md p-4 border border-gray-200">
              <div className="text-2xl font-bold text-gray-800">300+</div>
              <div className="text-sm text-gray-600">Active Volunteers</div>
            </div>
            
            <div className="absolute -bottom-6 -right-6 bg-gray-50 rounded-lg shadow-md p-4 border border-gray-200">
              <div className="text-2xl font-bold text-gray-800">2,000+</div>
              <div className="text-sm text-gray-600">Hours Donated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default VolunteerSection

