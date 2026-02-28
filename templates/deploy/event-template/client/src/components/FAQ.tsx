import { useState } from "react";
import { Plus, Minus } from "lucide-react";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
}

const FAQ = () => {
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});

  const faqItems: FAQItem[] = [
    {
      id: 1,
      question: "What is the dress code for the wedding?",
      answer: "We're having a semi-formal outdoor celebration. For men, we suggest dress pants with a button-down shirt or polo, and optional blazer. For women, sundresses, nice pants with blouses, or skirts are perfect. Please avoid stiletto heels as we'll be on grass and gravel paths."
    },
    {
      id: 2,
      question: "Will there be transportation provided?",
      answer: "Yes! We're providing shuttle service from the main hotel blocks to the venue. Shuttles will begin running 30 minutes before the ceremony and continue until 30 minutes after the reception ends. Please check your invitation for pickup times and locations."
    },
    {
      id: 3,
      question: "Can I bring a plus-one?",
      answer: "Plus-ones are by invitation only due to venue capacity. If you're unsure whether your invitation includes a guest, please check your RSVP or contact us directly. We appreciate your understanding as we work within our venue limitations."
    },
    {
      id: 4,
      question: "What time should I arrive?",
      answer: "Please plan to arrive 15-20 minutes before the ceremony starts at 4:00 PM. This will give you time to find parking, check in, and get seated. The cocktail hour begins immediately after the ceremony at 4:30 PM."
    },
    {
      id: 5,
      question: "Will the ceremony and reception be outdoors?",
      answer: "Yes, both the ceremony and reception will be held outdoors in our beautiful vineyard setting. We have a covered backup plan in case of rain, and we'll keep you updated on any weather-related changes leading up to the wedding."
    },
    {
      id: 6,
      question: "Are children welcome?",
      answer: "We love children, but we've decided to have an adults-only celebration to allow our guests to relax and enjoy the evening. We hope this advance notice helps with arrangements and that you can still join us for our special day."
    },
    {
      id: 7,
      question: "What about dietary restrictions?",
      answer: "Please let us know about any dietary restrictions or food allergies when you RSVP. Our caterer can accommodate most dietary needs including vegetarian, vegan, gluten-free, and common allergies. We want to make sure everyone can enjoy the meal!"
    },
    {
      id: 8,
      question: "Where should I stay?",
      answer: "We have room blocks reserved at two hotels: The Napa Valley Lodge and Hotel Yountville. Both offer group discounts and complimentary shuttle service to our venue. Booking details and discount codes are included with your invitation."
    }
  ];

  const toggleItem = (id: number) => {
    setOpenItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <section id="faq" className="py-20 ">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="font-heading text-4xl md:text-5xl font-bold mb-6">
            Frequently Asked <span className="text-pink-400">Questions</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Everything you need to know about our special weekend. If you have other questions, feel free to reach out!
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto">
          {faqItems.map((item) => (
            <div 
              key={item.id}
              className="border-b border-border/30"
            >
              <button
                onClick={() => toggleItem(item.id)}
                className="w-full px-6 py-6 text-left flex items-center justify-between hover:bg-gold/5 transition-colors duration-200"
              >
                <h4 className="font-medium text-foreground pr-4">
                  {item.question}
                </h4>
                <div className="text-gold flex-shrink-0">
                  {openItems[item.id] ? (
                    <Minus size={20} />
                  ) : (
                    <Plus size={20} />
                  )}
                </div>
              </button>
              
              {openItems[item.id] && (
                <div className="px-6 pb-6">
                  <div className="text-muted-foreground leading-relaxed">
                    {item.answer}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;

