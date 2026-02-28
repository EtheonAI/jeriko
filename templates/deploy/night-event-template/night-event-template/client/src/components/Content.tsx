
import { useState } from 'react'
import dj1Image from '@/assets/dj1.webp'
import dj2Image from '@/assets/dj2.webp'
import dj3Image from '@/assets/dj3.webp'
import dj4Image from '@/assets/dj4.webp'
import { ShinyButton } from "@/components/magicui/shiny-button";
import { AnimatedShinyText } from "@/components/magicui/animated-shiny-text";

interface ContentProps {
  activeSection: string;
}

const Content = ({ activeSection }: ContentProps) => {
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null)

  const topics = [
    {
      title: "Electronic Vibes",
      description: "Experience pulsating electronic beats from underground house to euphoric EDM that will keep you dancing all night long.",
      icon: "🎵"
    },
    {
      title: "VIP Experience", 
      description: "Exclusive access to premium areas, bottle service, and private performances in our luxurious VIP sections.",
      icon: "👑"
    },
    {
      title: "Interactive Arts",
      description: "Immerse yourself in stunning visual projections, laser shows, and interactive art installations throughout the venue.",
      icon: "🎨"
    },
    {
      title: "Late Night Dining",
      description: "Gourmet street food vendors and signature cocktails curated by award-winning mixologists and local chefs.",
      icon: "🍸"
    }
  ]

  const performers = [
    {
      name: "DJ Midnight",
      role: "Headlining Electronic DJ & Producer",
      image: dj1Image
    },
    {
      name: "Luna Eclipse", 
      role: "Progressive House DJ & Visual Artist",
      image: dj2Image
    },
    {
      name: "Beat Nexus",
      role: "Underground Techno Pioneer & Party Curator",
      image: dj3Image
    },
    {
      name: "Neon Dreams",
      role: "Synthwave DJ & Live Performance Artist",
      image: dj4Image
    }
  ]

  const venueInfo = {
    name: "Nexus Nightclub",
    address: "1425 Market Street San Francisco, California 94103",
    description: "Multi-level venue with rooftop terrace and VIP lounges featuring state-of-the-art sound systems and immersive visual experiences.",
    capacity: "2000+ party-goers",
    features: ["Rooftop Terrace", "VIP Lounges", "LED Dance Floor", "Professional Sound System"]
  }

  const faqData = [
    {
      id: 1,
      date: "27 Oct, 21:00",
      title: "SIGNATURE COCKTAIL MASTERCLASS",
      description: "Join our head mixologist for an exclusive cocktail crafting experience. Learn to create three signature drinks including the 'Nexus Neon', 'Electric Euphoria', and 'Midnight Madness'. All ingredients and premium spirits included - take home the recipes and impress your friends!",
      speaker: "Marco Santini: Head Mixologist & Cocktail Artist"
    },
    {
      id: 2,
      date: "27 Oct, 22:30", 
      title: "VIP BOTTLE SERVICE EXPERIENCE",
      description: "Discover the ultimate party luxury with our exclusive VIP bottle service. Premium spirits, personalized service, and prime location viewing of all main stage performances. Limited spots available - includes champagne toast and private cocktail server.",
      speaker: "Sofia Deluxe: VIP Experience Manager"
    },
    {
      id: 3,
      date: "27 Oct, 23:45",
      title: "DANCE BATTLE CHAMPIONSHIP", 
      description: "Show off your moves in our epic dance battle competition! Categories include freestyle, breakdance, and group performances. Winners receive premium bottles, VIP upgrades, and bragging rights. DJ Midnight provides the beats - you bring the energy!",
      speaker: "Alex Thunder: Dance Battle Host & Party MC"
    },
    {
      id: 4,
      date: "28 Oct, 01:15",
      title: "SHOTS & STORIES SOCIAL HOUR",
      description: "Connect with fellow party-goers in our intimate lounge area. Premium shot selections, networking games, and shared party stories. Perfect for making new friends and creating unforgettable memories. Special guest appearances by our headline DJs!",
      speaker: "Luna Martinez: Social Experience Coordinator"
    },
    {
      id: 5,
      date: "28 Oct, 02:45", 
      title: "ROOFTOP BAR TAKEOVER",
      description: "Experience breathtaking city views while enjoying craft cocktails and premium spirits. Our rooftop bar features exclusive drinks not available anywhere else in the venue. Watch the sunrise while dancing to ambient electronic beats.",
      speaker: "Diego Skyline: Rooftop Bar Manager & Resident DJ"
    },
    {
      id: 6,
      date: "28 Oct, 04:00",
      title: "AFTER PARTY WIND DOWN",
      description: "As the night comes to an end, join us for a more intimate experience. Chill beats, premium whiskey tastings, and comfortable seating areas. Share your favorite moments from the night while enjoying artisan coffee cocktails and light breakfast bites.",
      speaker: "Aria Nightfall: After Party Host & Wellness Guide"
    }
  ]



  const renderHomeSection = () => (
    <div>
      {/* Party Highlights Section */}
      <div className="mb-12">
        <h2 
          className="text-2xl font-normal mb-6 text-gray-900 tracking-wider"
          style={{fontFamily: "'Vina Sans', sans-serif"}}
        >
          Topics of this edition
        </h2>
        <div className="grid grid-cols-2 gap-6 mb-8">
          {topics.map((topic, index) => (
            <div key={index} className="p-0">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mb-3">
                <div className="text-xl">{topic.icon}</div>
              </div>
              <h3 
                className="text-base font-semibold mb-2 text-gray-900"
                style={{fontFamily: "'Inter', sans-serif"}}
              >
                {topic.title}
              </h3>
              <p 
                className="text-xs leading-relaxed text-gray-600"
                style={{fontFamily: "'Inter', sans-serif"}}
              >
                {topic.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* DJs Section */}
      <div className="mb-12">
        <h2 
          className="text-2xl font-normal mb-6 text-gray-900 tracking-wider"
          style={{fontFamily: "'Vina Sans', sans-serif"}}
        >
          Featured DJs
        </h2>
        <div className="grid grid-cols-2 gap-6 mb-8">
          {performers.map((dj, index) => (
            <div key={index} className="transition-all duration-300">
              <div className="aspect-square bg-gray-200 relative overflow-hidden mb-3 rounded-xl">
                <img 
                  src={dj.image} 
                  alt={dj.name}
                  className="w-full h-full object-cover rounded-xl"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const nextSibling = target.nextSibling as HTMLElement;
                    if (nextSibling) nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center hidden">
                  <span className="text-gray-600 text-4xl">🎧</span>
                </div>
              </div>
              <div>
                <h3 
                  className="text-sm font-bold mb-1 text-gray-900"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  {dj.name}
                </h3>
                <p 
                  className="text-xs text-gray-600"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  {dj.role}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Venue Section */}
      <div>
        <h2 
          className="text-2xl font-normal mb-6 text-gray-900 tracking-wider"
          style={{fontFamily: "'Vina Sans', sans-serif"}}
        >
          Venue
        </h2>
        <div className="mb-6">
          <AnimatedShinyText
            shimmerWidth={100}
          >
            {venueInfo.name}
          </AnimatedShinyText>
          <p 
            className="text-sm text-gray-600 my-3"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            📍 {venueInfo.address}
          </p>
          <p 
            className="text-xs leading-relaxed text-gray-500 mb-3"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            {venueInfo.description}
          </p>
          <div className="flex flex-wrap gap-1 mb-3">
            {venueInfo.features.map((feature, index) => (
              <span 
                key={index}
                className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full"
                style={{fontFamily: "'Inter', sans-serif"}}
              >
                {feature}
              </span>
            ))}
          </div>
          <p 
            className="text-xs font-semibold text-gray-700"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            Capacity: {venueInfo.capacity}
          </p>
        </div>
        
        {/* Map Component */}
        <div className="mb-4">
          <div className="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 relative overflow-hidden">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3152.9956748447624!2d-122.41941492347828!3d37.77847717197598!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x80858064e2e5d7b3%3A0x3a0c1c8d7d8d7d8d!2s1425%20Market%20St%2C%20San%20Francisco%2C%20CA%2094103!5e0!3m2!1sen!2sus!4v1647887432123!5m2!1sen!2sus"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0"
            />
            {/* Fallback overlay in case map doesn't load */}
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-200/50 to-purple-200/50">
              <div className="text-center p-4">
                <div className="text-4xl mb-2">📍</div>
                <p 
                  className="text-sm font-semibold text-gray-700"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  San Francisco, CA
                </p>
                <p 
                  className="text-xs text-gray-600"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  Click to open in maps
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const toggleFAQ = (faqId: number) => {
    setExpandedFAQ(expandedFAQ === faqId ? null : faqId)
  }

  const renderFAQ = () => (
    <div className="mb-12">
      <h2 
        className="text-3xl font-normal mb-8 text-gray-900 tracking-wider"
        style={{fontFamily: "'Vina Sans', sans-serif"}}
      >
        Party Experience Schedule
      </h2>
      <div className="space-y-4">
        {faqData.map((faq) => (
          <div 
            key={faq.id} 
            className="bg-white border-2 border-blue-300 rounded-lg overflow-hidden transition-all duration-300 hover:shadow-lg"
          >
            <div 
              className="p-6 cursor-pointer flex justify-between items-start"
              onClick={() => toggleFAQ(faq.id)}
            >
              <div className="flex-1">
                <div 
                  className="text-sm text-gray-600 mb-2"
                  style={{fontFamily: "'Inter', sans-serif"}}
                >
                  {faq.date}
                </div>
                <h3 
                  className="text-xl font-normal text-gray-900 tracking-wide mb-2"
                  style={{fontFamily: "'Vina Sans', sans-serif"}}
                >
                  {faq.title}
                </h3>
                {expandedFAQ === faq.id && (
                  <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
                    <p 
                      className="text-sm text-gray-700 leading-relaxed"
                      style={{fontFamily: "'Inter', sans-serif"}}
                    >
                      {faq.description}
                    </p>
                    <p 
                      className="text-sm font-medium text-gray-900 pt-2 border-t border-gray-100"
                      style={{fontFamily: "'Inter', sans-serif"}}
                    >
                      {faq.speaker}
                    </p>
                  </div>
                )}
              </div>
              <div className="ml-4 flex-shrink-0">
                <div className="w-8 h-8 flex items-center justify-center">
                  {expandedFAQ === faq.id ? (
                    <svg className="w-6 h-6 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderSchedule = () => (
    <div>
      {renderFAQ()}
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return renderHomeSection()
      case 'schedule':
        return renderSchedule()
      default:
        return renderHomeSection()
    }
  }

  return (
    <div className="w-[30%] h-screen fixed right-0 top-0 bg-white/90 backdrop-blur-[20px] border-l border-black/10 overflow-y-auto max-lg:w-full max-lg:h-[70vh] max-lg:relative max-lg:top-auto max-lg:right-auto" data-lenis-scroll>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating Gradient Orbs */}
        <div className="absolute top-10 right-8 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-500/20 rounded-full blur-xl animate-pulse"></div>
        <div className="absolute top-1/3 left-4 w-24 h-24 bg-gradient-to-br from-purple-400/15 to-pink-500/15 rounded-full blur-lg animate-bounce" style={{animationDuration: '3s'}}></div>
        <div className="absolute bottom-1/4 right-12 w-20 h-20 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 rounded-full blur-lg animate-pulse" style={{animationDelay: '1s'}}></div>
        
        {/* Geometric Patterns */}
        <div className="absolute top-1/2 left-2 w-1 h-16 bg-gradient-to-b from-blue-500/30 to-transparent animate-pulse" style={{animationDelay: '0.5s'}}></div>
        <div className="absolute top-3/4 right-6 w-1 h-12 bg-gradient-to-b from-purple-500/30 to-transparent animate-pulse" style={{animationDelay: '1.5s'}}></div>
        
        {/* Subtle Grid Pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(59 130 246) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }}></div>
        
        {/* Animated Light Rays */}
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-blue-400/10 via-transparent to-transparent animate-pulse" style={{animationDuration: '4s'}}></div>
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-tr from-purple-400/10 via-transparent to-transparent animate-pulse" style={{animationDuration: '5s', animationDelay: '2s'}}></div>
      </div>
      
      <div className="p-8 h-full max-md:p-6 relative z-10" data-lenis-content>
        {renderContent()}
        
        {/* CTA Section */}
        <div className="text-center py-8 mt-8 border-t border-black/10">
          <ShinyButton 
            className="bg-white text-black py-3 px-6 text-base font-semibold rounded-full transition-all duration-300 shadow-[0_4px_15px_rgba(59,130,246,0.3)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(59,130,246,0.4)]"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            Join the party!
          </ShinyButton>
          <p 
            className="text-sm text-gray-500 mt-4 m-0"
            style={{fontFamily: "'Inter', sans-serif"}}
          >
            847 party-goers already in! Limited VIP passes available.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Content

