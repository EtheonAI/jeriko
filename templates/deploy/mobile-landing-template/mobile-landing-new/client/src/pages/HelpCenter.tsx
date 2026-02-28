import { motion } from 'framer-motion';
import { useState } from 'react';

const faqs = [
  {
    question: 'What is Zenith?',
    answer: 'Zenith is a personal finance app that helps you manage your money, track your spending, and achieve your financial goals. We use AI to provide personalized insights and recommendations to help you make smarter financial decisions.'
  },
  {
    question: 'Is Zenith secure?',
    answer: 'Yes, security is our top priority. We use bank-level encryption to protect your data, and we never share your personal information with third parties without your consent.'
  },
  {
    question: 'How do I get started with Zenith?',
    answer: 'Getting started is easy! Simply download the app from the App Store or Google Play, create an account, and link your bank accounts. Zenith will automatically import and categorize your transactions.'
  },
  {
    question: 'Can I use Zenith on multiple devices?',
    answer: 'Yes, your Zenith account syncs across all your devices, so you can manage your finances from anywhere, at any time.'
  },
  {
    question: 'How much does Zenith cost?',
    answer: 'Zenith offers a free plan with essential features, as well as a premium subscription with advanced features like predictive budget planning and personalized savings challenges.'
  }
];

interface FaqItemProps {
  faq: {
    question: string;
    answer: string;
  };
}

function FaqItem({ faq }: FaqItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div 
      className="border-b border-gray-200 py-6"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <button 
        className="w-full flex justify-between items-center text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <h3 className="text-lg font-semibold">{faq.question}</h3>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <p className="text-gray-600 mt-4">{faq.answer}</p>
      </motion.div>
    </motion.div>
  );
}

function HelpCenter() {
  return (
    <section id="help-center" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Help Center</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Have questions? We're here to help.
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          {faqs.map((faq, index) => (
            <FaqItem key={index} faq={faq} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default HelpCenter;

