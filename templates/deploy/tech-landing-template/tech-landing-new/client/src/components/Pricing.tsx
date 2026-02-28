import { useState } from 'react';
import { motion } from 'framer-motion';


function Pricing() {
  const [isYearly, setIsYearly] = useState(false);

  const plans = [
    {
      name: "Basic Plan",
      description: "Perfect for small teams and startups.",
      price: "$0",
      period: "",
      features: [
        "Collaborative Workspace",
        "Intuitive Task Management", 
        "Real-Time Communication",
        "Free for up to 5 team members"
      ],
      cta: "Get Started for Free",
      highlighted: false,
      buttonColor: "bg-gradient-to-r from-gray-200 to-white hover:from-gray-100 hover:to-gray-50 shadow-lg"
    },
    {
      name: "Pro Plan", 
      description: "Ideal for growing teams with advanced needs.",
      price: "$19.99",
      period: "",
      features: [
        "Everything in Basic",
        "File Sharing and Version Control",
        "Task for Efficiency", 
        "Team Analytics and Insights"
      ],
      cta: "Get Started",
      highlighted: true,
      buttonColor: "bg-gradient-to-r from-gray-200 to-white hover:from-gray-100 hover:to-gray-50 shadow-lg"
    },
    {
      name: "Enterprise Plan",
      description: "Tailored for large teams and enterprises.",
      price: "$39.99", 
      period: "",
      features: [
        "Seamless Integrations",
        "Top-Tier Security Measures",
        "Dedicated Account Manager",
        "Unlimited Teams"
      ],
      cta: "Get Started",
      highlighted: false,
      buttonColor: "bg-gradient-to-r from-gray-200 to-white hover:from-gray-100 hover:to-gray-50 shadow-lg"
    }
  ];

  return (
    <section id="pricing" className="py-20 px-6 bg-[var(--bg-gray-900)]">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="text-sm font-semibold text-[var(--primary-color)] tracking-wider uppercase mb-4">
            PRICINGS
          </h3>
          <h2 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4">
            Choose a Plan That Suits Your Team
          </h2>
          <p className="text-xl text-[var(--text-secondary)] mb-8">
            Simple and Transparent Pricing to Fit Your Needs
          </p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center space-x-4 mb-12">
            <span className={`text-lg ${!isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              className="relative w-14 h-7 bg-[var(--bg-gray-700)] rounded-full transition-colors duration-200 focus:outline-none"
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-[var(--text-primary)] rounded-full transition-transform duration-200 ${
                  isYearly ? 'transform translate-x-7' : ''
                }`}
              />
            </button>
            <span className={`text-lg ${isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
              Yearly
            </span>
          </div>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className={`relative rounded-2xl p-8 transition-all duration-300 flex flex-col h-full ${
                plan.highlighted 
                  ? 'bg-gradient-to-b from-[var(--primary-hover)]/10 to-[var(--primary-hover)]/5 border-2 border-[var(--primary-color)]' 
                  : 'bg-[var(--bg-gray-800)]/80 border border-[var(--border-gray-700)]'
              }`}
            >
              
              <div className="text-center flex-grow">
                <h3 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                  {plan.name}
                </h3>
                <p className="text-[var(--text-secondary)] mb-6 min-h-[3rem] flex items-center justify-center">
                  {plan.description}
                </p>
                
                <div className="mb-8 min-h-[5rem] flex flex-col justify-center">
                  <span className="text-4xl md:text-5xl font-bold text-[var(--text-primary)]">
                    {plan.price}
                  </span>
                  <span className="text-[var(--text-secondary)] text-lg">
                    {plan.period}
                  </span>
                </div>
                
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`w-full py-4 px-8 rounded-full font-semibold transition-all duration-300 text-lg mb-8 ${plan.buttonColor} text-black`}
                >
                  {plan.cta}
                </motion.button>
              </div>
              
              <div className="flex-grow">
                <h4 className="text-[var(--text-primary)] font-semibold mb-6 text-lg">Features</h4>
                <ul className="space-y-4">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-4">
                      <div className="w-5 h-5 rounded-full border-2 border-[var(--text-primary)] flex items-center justify-center mt-0.5 flex-shrink-0">
                        <div className="w-2 h-2 bg-[var(--text-primary)] rounded-full"></div>
                      </div>
                      <span className="text-[var(--text-primary)] leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;

