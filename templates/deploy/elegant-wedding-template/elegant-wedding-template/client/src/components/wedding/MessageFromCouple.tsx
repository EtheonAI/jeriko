import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'

const MessageFromCouple = () => {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.8", "end 0.2"]
  })

  const message = "We're getting married! And we're so excited to celebrate our day with you. On this page, you'll find everything you need to know – schedule, location, dress code, accommodation – and you can RSVP directly here. See you this summer!"
  
  const words = message.split(' ')

  return (
    <section className="py-20 bg-cream" ref={ref}>
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
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

          <div className="text-2xl md:text-3xl leading-relaxed text-charcoal font-light">
            {words.map((word, index) => {
              const wordProgress = useTransform(
                scrollYProgress,
                [index / words.length, (index + 1) / words.length],
                [0, 1]
              )
              
              return (
                <motion.span
                  key={index}
                  className="inline-block mr-2"
                  style={{
                    color: useTransform(
                      wordProgress,
                      [0, 0.5, 1],
                      ['#D1C7BD', '#8B7D6B', '#2D2D2D']
                    )
                  }}
                >
                  {word}
                </motion.span>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

export default MessageFromCouple

