const Quote = () => {
  return (
    <section id="quote" className="">
      <div className="w-full">
        <div className="grid lg:grid-cols-2">
          {/* Image */}
          <div className="fade-in">
            <div className="relative h-64 sm:h-80 md:h-96 lg:h-[400px] bg-gray-200">
              {/* Professional woman image */}
              <img 
                src="/placeholder-image.webp" 
                alt="Professional Legal Consultant" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Quote Content */}
          <div className="fade-in lg:order-2 flex items-center">
            <div className="border-l-0 sm:border-l border-r-0 sm:border-r border-b border-gray-300 border-t-0 sm:border-t-transparent p-4 sm:p-6 lg:p-8 w-full flex flex-col justify-center min-h-64 sm:min-h-80 md:min-h-96 lg:h-[400px]">
              <div className="mb-6 sm:mb-8">
                <blockquote className="text-base sm:text-lg md:text-xl lg:text-2xl font-normal leading-tight text-gray-900 mb-6 sm:mb-8">
                  "Excellence in legal representation comes from understanding each client's unique needs and delivering personalized solutions. We are committed to providing strategic counsel that drives success and protects your interests."
                </blockquote>
              </div>
              
              <div className="border-l-4 border-[#150598] pl-4 sm:pl-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1 sm:mb-2">Jordan Smith</h3>
                <p className="text-[#150598] font-medium text-sm sm:text-base">Senior Partner</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Quote

