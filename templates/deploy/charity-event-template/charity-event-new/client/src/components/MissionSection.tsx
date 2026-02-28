import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { useMultipleScrollAnimations } from '@/hooks/useScrollAnimation'
import volunteerCoordinatorImage from '../assets/images/volunteer-coordinator-portrait.webp'

const MissionSection = () => {
  const everyDonationRef = useRef(null)
  const volunteerRef = useRef(null)

  // Setup multiple scroll-triggered animations with staggered delays
  useMultipleScrollAnimations([
    {
      ref: everyDonationRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 1500
    },
    {
      ref: volunteerRef,
      config: {
        type: 'highlight',
        color: '#fed7aa', // amber-200 color
        animationDuration: 1200
      },
      delay: 2200
    }
  ])
  return (
    <section id="about" className="py-20 bg-amber-50">
      <div className="container mx-auto px-4">
        {/* Mission Statement */}
        <div className="text-center mb-16">
          <h2 className="text-3xl lg:text-5xl font-bold text-gray-800 mb-8 leading-tight">
            Every initiative, <span ref={everyDonationRef} className="text-amber-800 whitespace-nowrap">every donation</span>, and every{' '}
            <span ref={volunteerRef} className="text-amber-800 whitespace-nowrap">volunteer</span> effort creates a lasting impact that{' '}
            fuels our mission of hope and change.
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Image */}
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl">
              <img 
                src={volunteerCoordinatorImage} 
                alt="Volunteer coordinator organizing food pantry" 
                className="w-full h-150 object-cover object-top hover:scale-110 transition-transform duration-500 ease-in-out"
              />
            </div>
          </div>

          {/* Right - Content */}
          <div>
            <p className="text-lg text-gray-700 mb-8 leading-relaxed">
              We turn generosity into action, creating food security in communities across our region. 
              Through our dedicated volunteers, generous donors, and strategic partnerships, we have 
              distributed thousands of meals and supported countless families.
            </p>

            <p className="text-lg text-gray-700 mb-12 leading-relaxed">
              With over 15,000 meals distributed, 300+ active volunteers, and $50K+ in food value donated, 
              we remain committed to making a tangible difference. Join us in creating a hunger-free 
              community—one meal at a time.
            </p>

            {/* Statistics Grid */}
            <div className="grid grid-cols-3 gap-8 mb-12">
              <div className="text-center">
                <div className="text-4xl font-bold text-amber-800 mb-2">
                  <NumberTicker value={15000} startValue={14800} className="text-4xl font-bold text-amber-800" delay={0.5} />
                </div>
                <div className="text-sm text-gray-600 uppercase tracking-wide">Meals Distributed</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-amber-800 mb-2">
                  <NumberTicker value={300} startValue={290} className="text-4xl font-bold text-amber-800" delay={0.8} />+
                </div>
                <div className="text-sm text-gray-600 uppercase tracking-wide">Active Volunteers</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-amber-800 mb-2">
                  $<NumberTicker value={50} startValue={40} className="text-4xl font-bold text-amber-800" delay={1.1} />K+
                </div>
                <div className="text-sm text-gray-600 uppercase tracking-wide">Food Value Donated</div>
              </div>
            </div>

            <Button className="bg-amber-700 hover:bg-amber-800 text-white px-8 py-3 rounded-full font-semibold shadow-lg">
              Learn More →
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MissionSection

