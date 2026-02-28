import React from 'react'
import { motion } from 'framer-motion'

const ElegantCard = ({ 
  children, 
  className = '', 
  variant = 'default',
  hover = true,
  delay = 0 
}) => {
  const variants = {
    default: 'bg-white border-gray-300',
    accent: 'bg-gray-50 border-gray-300',
    dark: 'bg-gray-900 border-gray-300 text-white',
    peach: 'bg-orange-50 border-gray-300'
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      whileInView={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
      whileHover={hover ? { y: -5 } : {}}
      className={`
        relative 
        ${variants[variant]}
        border-2
        shadow-lg
        ${hover ? 'hover:shadow-xl transition-all duration-300' : ''}
        ${className}
      `}
    >
      {/* Double line effect - outer frame */}
      <div className="absolute inset-2 border border-gray-200 pointer-events-none" />
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-gray-300" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-gray-300" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-gray-300" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-gray-300" />
      
      {/* Content container */}
      <div className="relative z-10 p-6">
        {children}
      </div>
    </motion.div>
  )
}

const ElegantCardHeader = ({ children, className = '' }) => (
  <div className={`border-b border-gray-200 pb-4 mb-4 ${className}`}>
    {children}
  </div>
)

const ElegantCardTitle = ({ children, className = '' }) => (
  <h3 className={`font-lustria text-xl font-medium text-gray-900 ${className}`}>
    {children}
  </h3>
)

const ElegantCardContent = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
)

const ElegantCardIcon = ({ children, variant = 'default', className = '' }) => {
  const iconVariants = {
    default: 'bg-gray-100 border-gray-300 text-gray-700',
    peach: 'bg-orange-100 border-gray-300 text-orange-800',
    dark: 'bg-gray-800 border-gray-300 text-white',
    white: 'bg-white border-gray-300 text-gray-700'
  }

  return (
    <div className={`
      w-12 h-12 
      border-2 
      ${iconVariants[variant]}
      flex items-center justify-center 
      relative
      mb-4
      ${className}
    `}>
      {/* Double border effect for icon */}
      <div className="absolute inset-1 border border-gray-200" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

export { ElegantCard, ElegantCardHeader, ElegantCardTitle, ElegantCardContent, ElegantCardIcon }