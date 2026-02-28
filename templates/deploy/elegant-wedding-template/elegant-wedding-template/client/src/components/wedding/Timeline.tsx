import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const Timeline = () => {
  const timelineEvents = [
    {
      time: "14:00",
      title: "Ceremony",
      description: "We gather in the garden for the ceremony. Please arrive a few minutes early.",
      image: "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2087&q=80"
    },
    {
      time: "15:00",
      title: "Drinks & mingle",
      description: "After the ceremony, we'll celebrate with something bubbly and light bites outdoors (weather permitting).",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
    },
    {
      time: "17:00",
      title: "Dinner in the hall",
      description: "A seated dinner will be served inside the manor. Expect good food, some speeches, and a few surprises.",
      image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
    },
    {
      time: "20:00",
      title: "Party & dancing",
      description: "When the sun is still up but the shoes come off – dancing, music, and drinks late into the summer night.",
      image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
    }
  ]

  const TimelineCard = ({ event, index, isLeft, isLast }: { event: typeof timelineEvents[0], index: number, isLeft: boolean, isLast: boolean }) => {
    const cardRef = useRef(null)
    const isInView = useInView(cardRef, { once: true, margin: "-100px" })

    return (
      <motion.div
        ref={cardRef}
        className="relative pb-8"
        initial={{ opacity: 0, y: 50 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        transition={{ duration: 0.6, delay: index * 0.2 }}
      >
        {/* Mobile Layout */}
        <div className="md:hidden">
          <div className="relative flex items-start gap-6">
            {/* Timeline line and dot */}
            <div className="relative flex flex-col items-center min-w-0">
              {/* Line segment - only show if not the last item */}
              {!isLast && (
                <div className="absolute top-8 left-1/2 transform -translate-x-1/2 w-px bg-charcoal/20 h-64">
                  <motion.div
                    className="absolute top-0 left-0 w-px bg-charcoal origin-top"
                    initial={{ height: "0%" }}
                    animate={isInView ? { height: "100%" } : { height: "0%" }}
                    transition={{ duration: 0.8, delay: index * 0.2 + 0.4 }}
                  />
                </div>
              )}
              
              {/* Time and dot */}
              <div className="flex flex-col items-center relative z-10">
                <span className="text-charcoal/60 text-sm font-medium mb-2 whitespace-nowrap">{event.time}</span>
                <motion.div
                  className="w-4 h-4 bg-charcoal/30 rounded-full border-4 border-white shadow-lg"
                  initial={{ scale: 0, backgroundColor: '#D1C7BD' }}
                  animate={isInView ? { scale: 1, backgroundColor: '#2D2D2D' } : { scale: 0, backgroundColor: '#D1C7BD' }}
                  transition={{ duration: 0.4, delay: index * 0.2 + 0.2 }}
                />
              </div>
            </div>
            
            {/* Card content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-serif text-charcoal mb-3">{event.title}</h3>
              <p className="text-charcoal/70 leading-relaxed mb-4 text-sm">{event.description}</p>
              
              <motion.img
                src={event.image}
                alt={event.title}
                className="w-full h-40 object-cover"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.6, delay: index * 0.2 + 0.3 }}
              />
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:block">
          <div className="flex flex-row items-start gap-8 relative max-w-4xl mx-auto justify-center">
            {/* Time and timeline column */}
            <div className="flex flex-col items-center relative">
              {/* Timeline line segment - only show if not the last item */}
              {!isLast && (
                <div className="absolute top-12 left-1/2 transform -translate-x-1/2 w-px bg-charcoal/20 h-80">
                  <motion.div
                    className="absolute top-0 left-0 w-px bg-charcoal origin-top"
                    initial={{ height: "0%" }}
                    animate={isInView ? { height: "100%" } : { height: "0%" }}
                    transition={{ duration: 0.8, delay: index * 0.2 + 0.4 }}
                  />
                </div>
              )}
              
              {/* Time */}
              <div className="bg-warm-cream px-3 py-1 rounded mb-4 relative z-10">
                <span className="text-charcoal/60 text-sm font-medium whitespace-nowrap">{event.time}</span>
              </div>
              
              {/* Dot */}
              <motion.div
                className="w-4 h-4 bg-charcoal/30 rounded-full border-4 border-white shadow-lg relative z-10"
                initial={{ scale: 0, backgroundColor: '#D1C7BD' }}
                animate={isInView ? { scale: 1, backgroundColor: '#2D2D2D' } : { scale: 0, backgroundColor: '#D1C7BD' }}
                transition={{ duration: 0.4, delay: index * 0.2 + 0.2 }}
              />
            </div>

            {/* Content column */}
            <div className="flex flex-col max-w-lg">
              <h3 className="text-2xl font-serif text-charcoal mb-4">{event.title}</h3>
              <p className="text-charcoal/70 leading-relaxed mb-6">{event.description}</p>
              
              <motion.img
                src={event.image}
                alt={event.title}
                className="w-full h-48 object-cover"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.6, delay: index * 0.2 + 0.3 }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <section className="py-20 bg-warm-cream" id="the-day">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          {/* Decorative hearts */}
          <motion.div
            className="flex justify-center space-x-2 mb-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <span className="text-charcoal/60">♥</span>
            <span className="text-charcoal/60">♥</span>
            <span className="text-charcoal/60">♥</span>
          </motion.div>

          <motion.h2
            className="text-4xl md:text-5xl font-serif text-charcoal mb-6"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            The Day
          </motion.h2>

          <motion.p
            className="text-charcoal/70 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            Here's what to expect on June 15. Everything takes place at Ulvhälls Herrgård, and we'll guide you throughout the day.
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto px-0">
          {timelineEvents.map((event, index) => (
            <TimelineCard
              key={index}
              event={event}
              index={index}
              isLeft={index % 2 === 0}
              isLast={index === timelineEvents.length - 1}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default Timeline

