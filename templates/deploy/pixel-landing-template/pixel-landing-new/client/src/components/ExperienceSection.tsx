const ExperienceSection = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-[#FF714B] to-[#C71E64] relative overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="mb-8">
            <h2 className="text-5xl lg:text-7xl font-black text-white mb-6">
              Ready to Play?
            </h2>
            <p className="text-xl lg:text-2xl text-white/90 mb-4">
              Join millions of kids having safe, educational fun!
            </p>
            <p className="text-lg text-white/80">
              100% free to start - no credit card needed to start playing.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-4 justify-center">
            <button className="bg-white text-[#FF714B] px-8 py-4 font-bold border-4 border-black shadow-[4px_4px_0px_0px_#000000] hover:shadow-[6px_6px_0px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all">
              Start Playing Free
            </button>
            <button className="bg-transparent border-4 border-white text-white px-8 py-4 font-bold shadow-[4px_4px_0px_0px_rgba(255,255,255,0.3)] hover:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.3)] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all">
              Watch Game Trailers
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ExperienceSection;

