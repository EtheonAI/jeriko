import React, { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

const FAQ = () => {
  const [expandedFAQ, setExpandedFAQ] = useState(-1)

  const faqs = [
    {
      id: 0,
      question: 'What digital services do you offer?',
      answer: 'We offer comprehensive digital solutions including web development, mobile app development, UI/UX design, brand identity, digital marketing, and strategic consulting. We handle everything from initial concept to final deployment and ongoing support.'
    },
    {
      id: 1,
      question: 'Can you work with our existing systems and branding?',
      answer: 'Absolutely! We can integrate with your existing systems, whether you need a complete digital transformation or want to enhance current platforms. We are skilled at modernizing legacy systems while maintaining brand consistency.'
    },
    {
      id: 2,
      question: 'How do we get started working together?',
      answer: 'Getting started is simple. We will have an initial consultation to understand your business needs, goals, and technical requirements. We will then provide a detailed proposal with timeline and pricing. Once approved, we begin with planning and development.'
    },
    {
      id: 3,
      question: 'How do you handle project revisions?',
      answer: 'We work collaboratively with regular progress reviews and feedback sessions. Each development phase includes review points where you can provide input. We include reasonable revisions to ensure the final product perfectly meets your requirements.'
    },
    {
      id: 4,
      question: 'Will we be involved during the development process?',
      answer: 'Yes, collaboration is essential. We involve you at key milestones with demos and progress updates. Your feedback helps shape the development direction and ensures the final product truly meets your business needs and user expectations.'
    },
    {
      id: 5,
      question: 'Do you take on small projects?',
      answer: 'Yes, we work on projects of all sizes, from simple landing pages to complex enterprise applications. Small projects are great for getting started, and they often grow into larger partnerships as your business scales.'
    }
  ]

  const toggleFAQ = (faqId: number) => {
    setExpandedFAQ(expandedFAQ === faqId ? -1 : faqId)
  }

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
      <div className="max-w-4xl mx-auto w-full h-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12 sm:mb-16">
          <div className="inline-block px-4 py-2 bg-white rounded-full text-sm text-gray-600 mb-6 shadow-sm">
            FAQs
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
            Answers to
            <br />
            your questions
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl">
            Curious about our development process, what to expect, or how to get started? We've gathered some common questions to help you feel confident before reaching out
          </p>
        </div>

        {/* FAQ Accordion */}
        <div className="space-y-3 sm:space-y-4">
          {faqs.map((faq) => (
            <div 
              key={faq.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <button
                onClick={() => toggleFAQ(faq.id)}
                className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-gray-50 transition-colors"
              >
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 pr-3 sm:pr-4 leading-tight">
                  {faq.question}
                </h3>
                <div className="flex-shrink-0 text-gray-400">
                  {expandedFAQ === faq.id ? (
                    <Minus size={18} className="sm:w-5 sm:h-5" />
                  ) : (
                    <Plus size={18} className="sm:w-5 sm:h-5" />
                  )}
                </div>
              </button>

              {expandedFAQ === faq.id && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default FAQ

