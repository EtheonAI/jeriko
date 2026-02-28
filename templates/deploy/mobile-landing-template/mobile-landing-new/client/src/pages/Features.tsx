import { useState } from 'react';
import { motion } from 'framer-motion';

const features = [
  {
    id: 'smart-transaction',
    title: 'Smart Transaction Categorization',
    description: 'AI automatically categorizes your transactions, shows confidence levels, and detects recurring patterns.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/smart-transaction.webp',
    position: 'left-top'
  },
  {
    id: 'budget-planning',
    title: 'Predictive Budget Planning',
    description: 'Forecast future expenses, get AI budget recommendations, and see upcoming bills and projected savings.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/bugdet-forecast.webp',
    position: 'left-bottom'
  },
  {
    id: 'financial-health',
    title: 'Financial Health Score',
    description: 'Get a comprehensive financial health score with a detailed breakdown and an AI-generated improvement plan.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/financial-health.webp',
    position: 'left-middle'
  },
  {
    id: 'savings-challenges',
    title: 'Personalized Savings Challenges',
    description: 'Receive AI-suggested savings challenges based on your spending patterns and track your progress.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/saving-challenges.webp',
    position: 'right-top'
  },
  {
    id: 'bill-negotiation',
    title: 'Bill Negotiation Assistant',
    description: 'Identify high bills, get negotiation scripts, and see potential savings with alternative providers.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/bill-negotiation.webp',
    position: 'right-middle'
  },
  {
    id: 'financial-goals',
    title: 'Financial Goal Visualization',
    description: 'Visualize your progress toward financial goals with milestone tracking and projection charts.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
      </svg>
    ),
    screenshot: '/assets/screenshots/financial-goals.webp',
    position: 'right-bottom'
  }
];

function Features() {
  const [activeFeature, setActiveFeature] = useState('smart-transaction');

  const getActiveScreenshot = () => {
    const feature = features.find(f => f.id === activeFeature);
    return feature ? feature.screenshot : features[0].screenshot;
  };

  return (
    <section id="features" className="py-20 bg-white min-h-screen relative overflow-hidden">
      <div className="container mx-auto px-4">
        <motion.div 
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Features</h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Money Manager has easy and various features.
          </p>
        </motion.div>


        <div className="relative flex flex-col lg:flex-row items-center justify-center">
          {/* Left Features - Desktop Only */}
          <div className="hidden lg:block w-full lg:w-1/3 space-y-12 lg:pr-8 z-10">
            {features.slice(0, 3).map((feature, index) => (
              <motion.div 
                key={index}
                className={`flex flex-col items-end text-right cursor-pointer transition-all duration-300 ${activeFeature === feature.id ? 'scale-105' : 'opacity-80 hover:opacity-100'}`}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onMouseEnter={() => setActiveFeature(feature.id)}
                onClick={() => setActiveFeature(feature.id)}
              >
                <div className="flex items-center mb-3">
                  <h3 className="text-xl font-semibold mr-4">{feature.title}</h3>
                  <div className={`w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md ${activeFeature === feature.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}>
                    {feature.icon}
                  </div>
                </div>
                <p className="text-gray-600 max-w-xs">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Center Phone */}
          <motion.div 
            className="w-full lg:w-1/3 py-12 lg:py-0 z-20 flex justify-center items-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <div className="relative w-full h-[560px]">
              <div className="absolute inset-0">
                <div className="w-full h-full rounded-[2.3rem] overflow-hidden">
                  <img 
                    src={getActiveScreenshot()} 
                    alt="App Screenshot" 
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Features - Desktop Only */}
          <div className="hidden lg:block w-full lg:w-1/3 space-y-12 lg:pl-8 z-10">
            {features.slice(3).map((feature, index) => (
              <motion.div 
                key={index + 3}
                className={`flex flex-col items-start cursor-pointer transition-all duration-300 ${activeFeature === feature.id ? 'scale-105' : 'opacity-80 hover:opacity-100'}`}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onMouseEnter={() => setActiveFeature(feature.id)}
                onClick={() => setActiveFeature(feature.id)}
              >
                <div className="flex items-center mb-3">
                  <div className={`w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-md ${activeFeature === feature.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-semibold ml-4">{feature.title}</h3>
                </div>
                <p className="text-gray-600 max-w-xs">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Mobile Features - Below Screenshot */}
        <div className="block lg:hidden mt-16">
          <div className="grid grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div 
                key={index}
                className={`flex flex-col items-center text-center cursor-pointer transition-all duration-300 ${activeFeature === feature.id ? 'scale-105' : 'opacity-80 hover:opacity-100'}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onMouseEnter={() => setActiveFeature(feature.id)}
                onClick={() => setActiveFeature(feature.id)}
              >
                <div className="flex flex-col items-center mb-3">
                  <div className={`w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-md mb-3 ${activeFeature === feature.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`}>
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                </div>
                <p className="text-gray-600 text-sm">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Features;

