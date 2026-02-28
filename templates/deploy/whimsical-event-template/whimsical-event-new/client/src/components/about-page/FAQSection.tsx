import { useState } from 'react';
import BadgePill from '../ui/badge-pill';

interface FAQSectionProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function FAQSection({ theme }: FAQSectionProps) {
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

  const faqData = [
    {
      id: 1,
      question: "Where is the carnival located?",
      answer: "At the Wonderland Fairgrounds, just outside the city center. Free shuttle service is available from downtown every 30 minutes."
    },
    {
      id: 2,
      question: "Are there height restrictions for rides?",
      answer: "Yes, some rides have height requirements for safety. Children under 42 inches must be accompanied by an adult on most rides."
    },
    {
      id: 3,
      question: "Is the carnival family-friendly?",
      answer: "Absolutely! We have rides and attractions for all ages, from gentle kiddie rides to thrilling roller coasters for teens and adults."
    },
    {
      id: 4,
      question: "How much do rides cost?",
      answer: "Individual ride tickets are $3-8 each, or you can purchase unlimited ride wristbands for $45/day. Game tokens are sold separately."
    },
    {
      id: 5,
      question: "Is the carnival accessible?",
      answer: "Yes! All pathways are wheelchair accessible, and we have accessible restrooms and designated viewing areas for shows."
    },
    {
      id: 6,
      question: "Can I bring my own food?",
      answer: "Outside food is not permitted, but we have amazing carnival treats like cotton candy, funnel cakes, corn dogs, and fresh lemonade!"
    },
    {
      id: 7,
      question: "What happens if it rains?",
      answer: "Most rides operate rain or shine, but some may close during severe weather for safety. Indoor games and food stands remain open."
    },
    {
      id: 8,
      question: "Can I win real prizes at games?",
      answer: "Yes! Our carnival games offer real prizes including stuffed animals, toys, and electronics. Every game is winnable with skill and luck!"
    }
  ];

  const toggleFAQ = (id: number) => {
    setOpenFAQ(openFAQ === id ? null : id);
  };

  return (
    <div className="max-w-5xl mx-auto py-16 px-8">
      <div className="text-center mb-12">
        <BadgePill theme={theme} emoji="❓" text="FAQ" />
        <h2 className={`text-5xl md:text-6xl font-['Ranchers'] ${theme.text} mb-8 drop-shadow-lg`}>
          KNOW BEFORE<br />
          YOU RIDE
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-6 auto-rows-min">
        {faqData.map((faq) => (
          <div 
            key={faq.id}
            className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 overflow-hidden"
            style={{ alignSelf: 'start' }}
          >
            <button
              onClick={() => toggleFAQ(faq.id)}
              className={`w-full p-6 text-left flex justify-between items-center ${theme.bg} text-white hover:opacity-90 transition-opacity duration-200`}
            >
              <h3 className="text-lg md:text-xl font-bold pr-4">{faq.question}</h3>
              <div className={`text-2xl transform transition-transform duration-300 flex-shrink-0 ${openFAQ === faq.id ? 'rotate-45' : ''}`}>
                {openFAQ === faq.id ? '×' : '+'}
              </div>
            </button>
            <div className={`transition-all duration-300 ease-in-out ${openFAQ === faq.id ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="p-6 bg-white">
                <p className="text-gray-700 text-lg leading-relaxed">{faq.answer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FAQSection;

