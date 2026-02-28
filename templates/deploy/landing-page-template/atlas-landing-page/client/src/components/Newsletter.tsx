const Newsletter = () => {
  return (
    <section id="newsletter" className="bg-white py-0">
      <div className="container px-6 lg:px-8 mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="atlas-chip">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-atlas-500 text-white mr-2">
              05
            </span>
            <span>Newsletter</span>
          </div>
        </div>

        <h2 className="text-5xl font-display font-bold mb-4 text-left">
          Subscribe to the newsletter
        </h2>
        <p className="text-xl text-gray-700 mb-8 text-left">
          Be first to hear about breakthroughs, partnerships, and deployment
          opportunities
        </p>

        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-atlas-100 text-atlas-600 border border-atlas-200">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12,6 12,12 16,14"></polyline>
            </svg>
            <span className="font-medium">Coming Soon</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Newsletter;

