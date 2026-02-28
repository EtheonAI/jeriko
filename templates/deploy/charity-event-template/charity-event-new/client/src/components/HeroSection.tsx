import { Button } from '@/components/ui/button'
import { useScrollAnimation } from '@/hooks/useScrollAnimation'
import heroChildrenImage from '../assets/images/hero-children-happy.webp'
import volunteersPackingImage from '../assets/images/volunteers-packing-hero.webp'
import blobSvg from '../assets/blob.svg'

const HeroSection = () => {
  const { ref: atATimeRef } = useScrollAnimation({
    type: 'underline',
    color: '#fb923c', // orange-400 color to match existing design
    strokeWidth: 3,
    animationDuration: 1500
  }, 1000) // 1000ms delay after element becomes visible

  return (
    <section id="home" className="relative bg-gradient-to-br from-amber-900 via-amber-800 to-orange-900 overflow-hidden">
      {/* Background Pattern */}

      <div className="container mx-auto px-6 pt-32 pb-16 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="text-white font-header">
            {/* Event Date Banner */}
            <div className="bg-orange-500 text-white px-6 py-3 rounded-full inline-block mb-6 font-semibold text-lg shadow-lg">
              📅 Community Food Drive • Saturday, March 15, 2025 • 9:00 AM - 4:00 PM
            </div>

            <h1 className="text-6xl lg:text-7xl font-medium leading-tight mb-6">
              Nourish hope,{' '} one
              <span className="block">
                meal <span ref={atATimeRef}>at a time</span>
              </span>
            </h1>
            
            <p className="text-xl text-amber-100 mb-4 leading-relaxed">
              Join us for our special one-day food drive event! Every donation, every volunteer hour, and every act of kindness helps us fight hunger in our community and bring hope to families in need.
            </p>

            {/* Event Details */}
            <div className="flex items-center space-x-8 mb-8">
              <div className="text-center">
                <div className="text-3xl font-semibold text-orange-300">Community Center</div>
                <div className="text-sm text-amber-200">Main St Location</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-semibold text-orange-300">9AM - 4PM</div>
                <div className="text-sm text-amber-200">Event Hours</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-semibold text-orange-300">5,000</div>
                <div className="text-sm text-amber-200">Meal Goal</div>
              </div>
            </div>

          </div>

          {/* Right Images */}
          <div className="relative">
            {/* Blob SVG Background */}
            <div className="absolute -top-32 -right-32 w-96 h-96 opacity-5 z-0">
              <img 
                src={blobSvg} 
                alt="" 
                className="w-full h-full object-contain transform scale-300 rotate-45" 
              />
            </div>
            
            <div className="relative z-10">

              {/* Main Hero Image with White Border */}
              <div className="relative">
                <div className="bg-white p-4 rounded-3xl shadow-2xl transform rotate-2 hover:rotate-0 transition-transform duration-300">
                  <div className="rounded-2xl overflow-hidden">
                    <img 
                      src={heroChildrenImage} 
                      alt="Happy children enjoying nutritious meals" 
                      className="w-full h-80 object-cover"
                    />
                  </div>
                </div>

                {/* Secondary Overlapping Image */}
                <div className="absolute -bottom-16 -left-12 w-72 rounded-2xl overflow-hidden shadow-xl transform -rotate-3 hover:rotate-0 transition-transform duration-300">
                  <img 
                    src={volunteersPackingImage} 
                    alt="Volunteers packing food donations" 
                    className="w-full h-48 object-cover"
                  />
                </div>


              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Wave */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1920 120" preserveAspectRatio="none" className="w-full h-16 fill-amber-50">
          <path d="M0,60 C320,120 640,0 960,60 C1280,120 1600,0 1920,60 L1920,120 L0,120 Z"></path>
        </svg>
      </div>
    </section>
  )
}

export default HeroSection

