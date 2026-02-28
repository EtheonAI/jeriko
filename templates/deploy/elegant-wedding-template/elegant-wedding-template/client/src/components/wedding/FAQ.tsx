import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'

const FAQ = () => {
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({})

  const toggleItem = (index: number) => {
    setOpenItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const faqItems = [
    {
      question: "Can I bring a plus one?",
      answer: "Yes! We've allocated space for plus ones. Please let us know when you RSVP so we can plan accordingly."
    },
    {
      question: "Are kids welcome?",
      answer: "We love children, but we've decided to keep our wedding an adults-only celebration. We hope you understand and can arrange childcare for the evening."
    },
    {
      question: "What should I wear?",
      answer: "We're going for cocktail attire. Think elegant and semi-formal. Ladies can wear cocktail dresses or dressy separates, and gentlemen should wear suits or dress pants with a dress shirt."
    },
    {
      question: "Will there be vegetarian/vegan food?",
      answer: "Absolutely! We'll have delicious vegetarian and vegan options available. Please let us know about any dietary restrictions when you RSVP."
    },
    {
      question: "Can I give a speech?",
      answer: "We'd love to hear from you! Please reach out to us beforehand so we can coordinate the timing and make sure everyone gets a chance to speak."
    }
  ]

  return (
    <section className="py-20 bg-warm-cream" id="faq">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          {/* Decorative hearts */}
          <motion.div
            className="flex justify-center space-x-2 mb-8"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            viewport={{ once: true }}
          >
            <span className="text-charcoal">♥</span>
            <span className="text-charcoal">♥</span>
            <span className="text-charcoal">♥</span>
          </motion.div>

          <motion.h2
            className="text-4xl md:text-5xl font-serif text-charcoal text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            viewport={{ once: true }}
          >
            You also might be wondering...
          </motion.h2>

          <div className="space-y-4">
            {faqItems.map((item, index) => (
              <motion.div
                key={index}
                className="border-b border-charcoal/20 pb-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
              >
                <button
                  onClick={() => toggleItem(index)}
                  className="w-full flex justify-between items-center py-4 text-left hover:opacity-70 transition-opacity duration-200"
                >
                  <h3 className="text-xl md:text-2xl font-serif text-charcoal pr-4">
                    {item.question}
                  </h3>
                  <motion.div
                    animate={{ rotate: openItems[index] ? 45 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <Plus className="w-6 h-6 text-charcoal" />
                  </motion.div>
                </button>
                
                <AnimatePresence>
                  {openItems[index] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="pb-4 pr-10">
                        <p className="text-charcoal/80 leading-relaxed text-lg">
                          {item.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default FAQ

