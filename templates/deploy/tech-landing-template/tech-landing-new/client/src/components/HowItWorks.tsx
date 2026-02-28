import { motion } from 'framer-motion';
import crmDashboardBl from '../assets/crm-dashboard-bl.webp';
import crmDashboardTr from '../assets/crm-dashboard-tr.webp';
import crmDashboardR from '../assets/crm-dashboard-r.webp';

function HowItWorks() {
  const steps = [
    {
      stepNumber: "STEP 1",
      title: "Sign Up in Minutes",
      description: "Start your journey by signing up in just a few minutes. No hassle, no complexity.",
      image: crmDashboardBl,
      alt: "Dashboard signup interface"
    },
    {
      stepNumber: "STEP 2",
      title: "Create Your Workspace",
      description: "Set up your workspace and invite team members. Organize projects and tasks effortlessly.",
      image: crmDashboardTr,
      alt: "Dashboard workspace interface"
    },
    {
      stepNumber: "STEP 3",
      title: "Collaborate and Achieve",
      description: "Experience the power of seamless collaboration. Achieve more together with our intuitive tools.",
      image: crmDashboardR,
      alt: "Dashboard analytics interface"
    }
  ];

  return (
    <section id="how-it-works" className="py-20 px-6 bg-[#121212]">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="text-sm font-semibold text-[#7C5DFA] tracking-wider uppercase mb-4">
            HOW TO USE?
          </h3>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            How it works?
          </h2>
        </motion.div>
        
        <div className="max-w-7xl mx-auto">
          {/* Desktop Layout */}
          <div className="hidden lg:grid lg:grid-cols-2 lg:grid-rows-2 gap-6 h-[900px]">
            {/* Step 1 - Top Left */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="relative rounded-2xl overflow-hidden bg-[#1E1E1E] border border-[#7C5DFA]/30 p-8 flex flex-col cursor-pointer"
            >
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#7C5DFA] tracking-wider uppercase mb-2 block">
                  {steps[0].stepNumber}
                </span>
                <h3 className="text-2xl font-bold text-white mb-4">
                  {steps[0].title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {steps[0].description}
                </p>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden bg-gray-800">
                <img
                  src={steps[0].image}
                  alt={steps[0].alt}
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Step 3 - Right Side (Full Height) */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="relative rounded-2xl overflow-hidden bg-[#1E1E1E] border border-[#7C5DFA]/30 p-8 flex flex-col row-span-2 cursor-pointer"
            >
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#7C5DFA] tracking-wider uppercase mb-2 block">
                  {steps[2].stepNumber}
                </span>
                <h3 className="text-2xl font-bold text-white mb-4">
                  {steps[2].title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {steps[2].description}
                </p>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden bg-gray-800">
                <img
                  src={steps[2].image}
                  alt={steps[2].alt}
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Step 2 - Bottom Left */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -8, scale: 1.02 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
              className="relative rounded-2xl overflow-hidden bg-[#1E1E1E] border border-[#7C5DFA]/30 p-8 flex flex-col cursor-pointer"
            >
              <div className="mb-6">
                <span className="text-xs font-semibold text-[#7C5DFA] tracking-wider uppercase mb-2 block">
                  {steps[1].stepNumber}
                </span>
                <h3 className="text-2xl font-bold text-white mb-4">
                  {steps[1].title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {steps[1].description}
                </p>
              </div>
              <div className="flex-1 rounded-xl overflow-hidden bg-gray-800">
                <img
                  src={steps[1].image}
                  alt={steps[1].alt}
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>

          {/* Mobile Layout */}
          <div className="lg:hidden space-y-8">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8, scale: 1.02 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="relative rounded-2xl overflow-hidden bg-[#1E1E1E] border border-[#7C5DFA]/30 p-6 cursor-pointer"
              >
                <div className="mb-6">
                  <span className="text-xs font-semibold text-[#7C5DFA] tracking-wider uppercase mb-2 block">
                    {step.stepNumber}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-4">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
                <div className="h-64 rounded-xl overflow-hidden bg-gray-800">
                  <img
                    src={step.image}
                    alt={step.alt}
                    className="w-full h-full object-cover"
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default HowItWorks;

