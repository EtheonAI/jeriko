import { motion } from 'framer-motion'

const SkillsSection = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  }

  const itemVariants = {
    hidden: { y: 30, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.6
      }
    }
  }

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="bg-gray-50 rounded-3xl shadow-xl p-8 sm:p-12 lg:p-16"
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="space-y-8">
              <motion.div variants={itemVariants}>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
                  Building modern solutions with cutting-edge technology
                </h2>
              </motion.div>

              <motion.div variants={itemVariants} className="space-y-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Current Focus</h3>
                  <ul className="space-y-2 text-gray-600">
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      Scalable web applications
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      Modern JavaScript frameworks
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      Cloud-native development
                    </li>
                  </ul>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-sky-50 p-6 rounded-xl border border-blue-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    <span className="text-blue-500">Exploring</span>
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    <span className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium">
                      TypeScript
                    </span>
                    <span className="bg-blue-300 text-white px-4 py-2 rounded-full text-sm font-medium">
                      Docker
                    </span>
                  </div>
                  <p className="text-gray-600 mt-3 text-sm">
                    Continuously exploring emerging technologies to build better, more efficient applications.
                  </p>
                </div>
              </motion.div>
            </div>

            {/* Right Content - Character Illustration */}
            <motion.div variants={itemVariants} className="flex justify-center lg:justify-end">
              <div className="relative">
                <img 
                  src="/placeholder-mountain.webp" 
                  alt="Template skills illustration" 
                  className="w-96 h-96 object-cover rounded-2xl shadow-2xl"
                />
                <div className="absolute -top-4 -right-4 w-16 h-16 bg-blue-300 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white text-2xl">👍</span>
                </div>
                <div className="absolute -bottom-4 -left-4 w-12 h-12 bg-blue-400 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-white text-lg">⚡</span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default SkillsSection

