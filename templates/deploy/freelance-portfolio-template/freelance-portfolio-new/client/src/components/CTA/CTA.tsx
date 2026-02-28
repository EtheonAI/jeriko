import React from 'react'
import { Button } from '@/components/ui/button'

const CTA = () => {

  return (
    <section id="contact" className="py-12 sm:py-16 lg:py-20 bg-white">
      <div className="max-w-4xl mx-auto w-full h-full text-center px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
          Ready to build
          <br />
          something amazing?
        </h2>
        <p className="text-lg sm:text-xl text-gray-600 mb-8 sm:mb-12 max-w-2xl mx-auto">
          Let's discuss your project and discover how we can help you create digital solutions
          <br className="hidden sm:block" />
          that drive growth and deliver exceptional user experiences
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Button 
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg w-full sm:w-auto"
            size="lg"
          >
            Start Your Project
          </Button>
          <Button 
            variant="outline"
            className="border-2 border-amber-400 text-gray-900 hover:bg-amber-50 px-6 sm:px-8 py-2 sm:py-3 text-base sm:text-lg w-full sm:w-auto"
            size="lg"
          >
            Schedule a Call
          </Button>
        </div>
        
        {/* Contact Information */}
        <div className="mt-8 sm:mt-12 pt-6 sm:pt-8 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 text-center">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Email Us</h3>
              <p className="text-gray-600 text-sm sm:text-base">hello@digitalstudio.dev</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Call Us</h3>
              <p className="text-gray-600 text-sm sm:text-base">+1 (555) 123-4567</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base">Location</h3>
              <p className="text-gray-600 text-sm sm:text-base">San Francisco, CA</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default CTA

