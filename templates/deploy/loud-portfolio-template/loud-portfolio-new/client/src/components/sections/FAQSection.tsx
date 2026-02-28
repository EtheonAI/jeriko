import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const FAQSection = () => {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const faqs = [
    {
      id: 1,
      question: "What marketing services do you offer?",
      answer: "I specialize in SEO, content marketing, social media marketing, email marketing, marketing strategy development, and analytics & reporting. Each service is tailored to your specific business needs.",
      color: "green",
      bgColor: "bg-accent-green",
      textColor: "text-white"
    },
    {
      id: 2,
      question: "How do you measure campaign success?",
      answer: "I track success through data-driven metrics including ROI, conversion rates, traffic growth, engagement rates, and custom KPIs aligned with your business objectives.",
      color: "blue",
      bgColor: "bg-accent-blue",
      textColor: "text-white"
    },
    {
      id: 3,
      question: "How can we get started working together?",
      answer: "Simply contact me for a free consultation where we'll discuss your business goals, current challenges, and how I can help create a tailored marketing strategy for your success.",
      color: "yellow",
      bgColor: "bg-accent-yellow",
      textColor: "text-black"
    },
    {
      id: 4,
      question: "Do you provide ongoing support and optimization?",
      answer: "Absolutely! I provide continuous campaign monitoring, regular optimizations, detailed performance reports, and strategic adjustments to ensure your marketing efforts deliver maximum results.",
      color: "purple",
      bgColor: "bg-accent-purple",
      textColor: "text-white"
    }
  ];

  const toggleFAQ = (id: number) => {
    setOpenFAQ(openFAQ === id ? null : id);
  };

  return (
    <section className="dark-section-alt py-20">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left Column - Section Info */}
          <div>
            <h3 className="section-subtitle text-accent-purple mb-4">FAQ</h3>
            <h2 className="section-title text-white mb-6">
              YOUR QUESTIONS ANSWERED
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              Everything You Need to Know About Revento, We have Answers to Your Questions About Revento's Services and Approach.
            </p>
          </div>

          {/* Right Column - FAQ Items */}
          <div className="space-y-4">
            {faqs.map((faq) => (
              <div
                key={faq.id}
                className="border border-gray-600 rounded-2xl overflow-hidden"
              >
                {/* Question Header */}
                <button
                  onClick={() => toggleFAQ(faq.id)}
                  className={`w-full p-6 text-left flex items-center justify-between transition-colors duration-300 ${
                    openFAQ === faq.id ? faq.bgColor : 'dark-card hover:bg-gray-700'
                  }`}
                >
                  <span className={`font-semibold text-lg ${
                    openFAQ === faq.id ? faq.textColor : 'text-white'
                  }`}>
                    {faq.question}
                  </span>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-300 ${
                    openFAQ === faq.id 
                      ? 'bg-white/20 text-white transform rotate-180' 
                      : 'bg-gray-600 text-gray-300'
                  }`}>
                    {openFAQ === faq.id ? (
                      <Minus className="w-5 h-5" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                  </div>
                </button>

                {/* Answer Content */}
                <div className={`overflow-hidden transition-all duration-300 ${
                  openFAQ === faq.id ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                }`}>
                  <div className="p-6 pt-0 bg-gray-800">
                    <p className="text-gray-300 leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQSection;

