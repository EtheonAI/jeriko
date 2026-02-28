import { motion } from 'framer-motion'
import { Mail, MessageCircle } from 'lucide-react'

const ContactSection = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
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
    <section id="contact" className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-7xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          {/* Section Header */}
          <motion.div variants={itemVariants} className="text-center mb-16">
            <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">
              GET IN TOUCH
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-8">
              Let's Connect
            </h2>
          </motion.div>

          {/* Contact Cards */}
          <motion.div variants={itemVariants} className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Connect Card */}
            <div className="bg-white border-2 border-blue-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors duration-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Connect</h3>
              <a 
                href="mailto:hello@yourname.dev" 
                className="text-xl font-bold text-blue-500 hover:text-blue-600 transition-colors"
              >
                hello@yourname.dev
              </a>
              <p className="text-gray-600 mt-2">For general inquiries and new projects</p>
            </div>

            {/* Collaborations Card */}
            <div className="bg-white border-2 border-blue-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors duration-200">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Collaborations</h3>
              <a 
                href="mailto:collab@yourname.dev" 
                className="text-xl font-bold text-blue-500 hover:text-blue-600 transition-colors"
              >
                collab@yourname.dev
              </a>
              <p className="text-gray-600 mt-2">For partnerships and collaborations</p>
            </div>
          </motion.div>

          {/* Additional Info */}
          <motion.div variants={itemVariants} className="text-center mt-12">
            <div className="bg-white rounded-xl p-8 max-w-2xl mx-auto shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Ready to bring your ideas to life?
              </h3>
              <p className="text-gray-600 mb-6">
                I'm always excited to work on new projects and collaborate with amazing people. Whether you need a web application, consulting, or just want to chat about technology, let's connect!
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>Available for new projects</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>Response within 24 hours</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

export default ContactSection

