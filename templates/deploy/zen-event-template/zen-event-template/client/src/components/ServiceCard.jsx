import React from 'react'
import { Button } from '@/components/ui/button.jsx'
import { motion } from 'framer-motion'
import { ArrowRight, BarChart3 } from 'lucide-react'

const ServiceCard = ({ service }) => {
  const { title, description, backgroundColor, direction, mockupType, services } = service
  const isReverse = direction === 'reverse'

  const renderMockup = () => {
    switch (mockupType) {
      case 'mobile':
        return (
          <div className="flex space-x-4">
            <motion.div 
              className="w-32 h-56 bg-white rounded-2xl shadow-lg flex flex-col"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true }}
              whileHover={{ y: -10 }}
            >
              <div className="h-6 bg-gray-100 rounded-t-2xl"></div>
              <div className="flex-1 p-3 space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-green-500 rounded mt-4"></div>
              </div>
            </motion.div>
            <motion.div 
              className="w-32 h-56 bg-gray-900 rounded-2xl shadow-lg flex flex-col"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              viewport={{ once: true }}
              whileHover={{ y: -10 }}
            >
              <div className="h-6 bg-gray-800 rounded-t-2xl"></div>
              <div className="flex-1 p-3 space-y-2">
                <div className="h-3 bg-green-400 rounded"></div>
                <div className="h-3 bg-gray-600 rounded w-3/4"></div>
                <div className="h-8 bg-gray-700 rounded mt-4"></div>
              </div>
            </motion.div>
          </div>
        )

      case 'dashboard':
        return (
          <motion.div 
            className="w-80 h-48 bg-gray-900 rounded-lg shadow-lg p-4"
            initial={{ y: 20, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
            whileHover={{ y: -10, scale: 1.05 }}
          >
            <motion.div 
              className="flex justify-between items-center mb-4"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              viewport={{ once: true }}
            >
              <div className="h-3 bg-purple-400 rounded w-20"></div>
              <div className="h-3 bg-gray-600 rounded w-16"></div>
            </motion.div>
            <motion.div 
              className="space-y-3"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
              viewport={{ once: true }}
            >
              <div className="h-2 bg-gray-700 rounded"></div>
              <div className="h-2 bg-gray-700 rounded w-3/4"></div>
              <motion.div 
                className="h-16 bg-purple-500 rounded mt-4 flex items-center justify-center"
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
              >
                <BarChart3 className="w-8 h-8 text-white" />
              </motion.div>
            </motion.div>
          </motion.div>
        )

      case 'cards':
        return (
          <div className="grid grid-cols-2 gap-4">
            <motion.div 
              className="w-32 h-24 bg-white rounded-lg shadow p-2"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true }}
              whileHover={{ y: -10, scale: 1.05 }}
            >
              <div className="h-2 bg-gray-300 rounded mb-2"></div>
              <div className="h-2 bg-gray-300 rounded w-3/4"></div>
            </motion.div>
            <motion.div 
              className="w-32 h-24 bg-gray-900 rounded-lg shadow p-2"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              viewport={{ once: true }}
              whileHover={{ y: -10, scale: 1.05 }}
            >
              <div className="h-2 bg-cyan-400 rounded mb-2"></div>
              <div className="h-2 bg-gray-600 rounded w-3/4"></div>
            </motion.div>
            <motion.div 
              className="w-32 h-24 bg-white rounded-lg shadow p-2 col-span-2"
              initial={{ y: 20, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              viewport={{ once: true }}
              whileHover={{ y: -5, scale: 1.03 }}
            >
              <div className="h-2 bg-gray-300 rounded mb-1"></div>
              <div className="h-2 bg-gray-300 rounded mb-1"></div>
              <div className="h-2 bg-gray-300 rounded w-1/2"></div>
            </motion.div>
          </div>
        )

      default:
        return null
    }
  }

  const TextContent = () => (
    <motion.div
    className={"md:lg:ml-20"}
      initial={{ x: isReverse ? 50 : -50, opacity: 0 }}
      whileInView={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      viewport={{ once: true, margin: "-100px" }}
    >
      <motion.h2 
        className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 font-lustria"
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        viewport={{ once: true }}
      >
        {title}
      </motion.h2>
      <motion.p 
        className="text-base md:text-lg text-gray-600 mb-6 md:mb-8 leading-relaxed font-satoshi"
        initial={{ y: 20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        viewport={{ once: true }}
      >
        {description}
      </motion.p>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button className="bg-gray-900 hover:bg-gray-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-full flex items-center space-x-2 transition-all duration-300 hover:shadow-xl font-satoshi text-sm md:text-base">
          <span>I need this</span>
          <motion.div
            animate={{ x: [0, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
          </motion.div>
        </Button>
      </motion.div>
    </motion.div>
  )

  const VisualContent = () => (
    <motion.div 
      className="relative"
      initial={{ x: isReverse ? -50 : 50, opacity: 0 }}
      whileInView={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      viewport={{ once: true, margin: "-100px" }}
    >
      <motion.div 
        className={`${backgroundColor} rounded-3xl p-4 md:p-8 h-64 md:h-80 lg:h-96 flex items-center justify-center`}
        whileHover={{ scale: 1.02 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {renderMockup()}
      </motion.div>
      {/* Service card */}
      <motion.div 
        className={`absolute -bottom-4 md:-bottom-8 ${isReverse ? '-left-2 md:-left-8' : '-right-2 md:-right-8'} bg-gray-900 text-white p-4 md:p-6 rounded-2xl w-72 md:w-80`}
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        viewport={{ once: true }}
        whileHover={{ scale: 1.05, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}
      >
        <div className="space-y-3 md:space-y-4">
          {services.map(({ icon: IconComponent, text }, index) => (
            <motion.div 
              key={text}
              className="flex items-center space-x-3 font-satoshi text-sm md:text-base"
              initial={{ x: -20, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.8 + (index * 0.1) }}
              viewport={{ once: true }}
              whileHover={{ x: 5 }}
            >
              <IconComponent className="w-4 h-4 md:w-5 md:h-5" />
              <span>{text}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )

  return (
    <section className="px-4 md:px-8 lg:px-12 xl:px-24 py-12 md:py-16">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-center">
          {isReverse ? (
            <>
              <div className="order-2 lg:order-1">
                <VisualContent />
              </div>
              <div className="order-1 lg:order-2">
                <TextContent />
              </div>
            </>
          ) : (
            <>
              <TextContent />
              <VisualContent />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

export default ServiceCard