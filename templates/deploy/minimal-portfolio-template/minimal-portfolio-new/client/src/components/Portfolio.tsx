import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import placeholderProject from '../assets/placeholder-project.webp';

interface PortfolioSlide {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  background: string;
  isNDA: boolean;
  image: string;
}

const Portfolio = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideProgress, setSlideProgress] = useState(0);
  const [direction, setDirection] = useState(1);

  const portfolioSlides: PortfolioSlide[] = [
    {
      id: 1,
      title: "Kidney+",
      subtitle: "Care for your tomorrow",
      description: "Kidney+ is the personalized care service that helps you manage your chronic kidney disease (CKD) in between your regular doctor's visits, all from the comfort of your home.",
      tags: ["Healthcare", "UX/UI Design", "Mobile App", "Telemedicine"],
      background: "linear-gradient(135deg, var(--chart-4) 0%, var(--destructive) 100%)",
      isNDA: false,
      image: placeholderProject
    },
    {
      id: 2,
      title: "EcoMarket",
      subtitle: "Sustainable shopping made simple",
      description: "E-commerce platform designed to promote sustainable products and eco-friendly shopping habits with an intuitive user experience.",
      tags: ["E-commerce", "Web Design", "Sustainability", "UX Research"],
      background: "linear-gradient(135deg, var(--chart-2) 0%, var(--brand-dark) 100%)",
      isNDA: false,
      image: placeholderProject
    },
    {
      id: 3,
      title: "FinanceFlow",
      subtitle: "Banking reimagined",
      description: "Mobile banking app redesign focused on improving user experience and making financial management more accessible and intuitive.",
      tags: ["Fintech", "Mobile App", "UI/UX Design", "User Research"],
      background: "linear-gradient(135deg, var(--chart-1) 0%, var(--primary) 100%)",
      isNDA: true,
      image: placeholderProject
    }
  ];

  useEffect(() => {
    const slideInterval = setInterval(() => {
      setDirection(1);
      setCurrentSlide((prev) => (prev + 1) % portfolioSlides.length);
      setSlideProgress(0);
    }, 8000);

    const progressInterval = setInterval(() => {
      setSlideProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + (100 / 800);
      });
    }, 10);

    return () => {
      clearInterval(slideInterval);
      clearInterval(progressInterval);
    };
  }, [currentSlide, portfolioSlides.length]);

  const nextSlide = () => {
    setDirection(1);
    setCurrentSlide((prev) => (prev + 1) % portfolioSlides.length);
    setSlideProgress(0);
  };

  const prevSlide = () => {
    setDirection(-1);
    setCurrentSlide((prev) => (prev - 1 + portfolioSlides.length) % portfolioSlides.length);
    setSlideProgress(0);
  };

  const goToSlide = (index: number) => {
    setDirection(1);
    setCurrentSlide(index);
    setSlideProgress(0);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextSlide();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section className="min-h-screen px-6 pt-32">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium">My Projects</h2>
        </div>

        <div className="h-[600px]">
          <div className="relative h-full">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentSlide}
                custom={direction}
                className="relative h-full rounded-3xl overflow-hidden group cursor-pointer"
                style={{ background: portfolioSlides[currentSlide].background }}
                initial="initial"
                animate="animate"
                exit="exit"
                variants={{
                  initial: (direction) => ({
                    opacity: 0,
                    x: direction === -1 ? 300 : -300
                  }),
                  animate: {
                    opacity: 1,
                    x: 0
                  },
                  exit: (direction) => ({
                    opacity: 0,
                    x: direction === -1 ? -300 : 300
                  })
                }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              >
                <div className="absolute top-4 md:top-6 left-4 md:left-6 right-4 md:right-6 z-20">
                  <div className="flex space-x-2">
                    {portfolioSlides.map((_, index) => (
                      <div key={index} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-white rounded-full"
                          initial={{ width: '0%' }}
                          animate={{ 
                            width: index === currentSlide ? `${slideProgress}%` : index < currentSlide ? '100%' : '0%'
                          }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={prevSlide}
                  className="absolute left-2 md:left-6 top-1/2 transform -translate-y-1/2 z-30 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-2 md:p-3 rounded-full transition-all opacity-0 group-hover:opacity-100"
                  aria-label="Previous slide"
                >
                  <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                
                <button
                  onClick={nextSlide}
                  className="absolute right-2 md:right-6 top-1/2 transform -translate-y-1/2 z-30 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-2 md:p-3 rounded-full transition-all opacity-0 group-hover:opacity-100"
                  aria-label="Next slide"
                >
                  <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <div className="relative h-full p-4 md:p-8 flex flex-col justify-end">
                  <motion.div
                    className="text-white z-10 pr-4 sm:pr-0 sm:max-w-md md:max-w-lg"
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  >
                    <h3 className="text-2xl md:text-4xl font-bold mb-2">{portfolioSlides[currentSlide].title}</h3>
                    {portfolioSlides[currentSlide].subtitle && (
                      <p className="text-lg md:text-xl mb-4 text-white/90">{portfolioSlides[currentSlide].subtitle}</p>
                    )}
                    <p className="text-sm mb-6 text-white/80 leading-relaxed">
                      {portfolioSlides[currentSlide].description}
                    </p>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                      {portfolioSlides[currentSlide].tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="bg-white/20 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>

                    {portfolioSlides[currentSlide].isNDA && (
                      <div className="inline-flex items-center bg-black/30 backdrop-blur-sm text-white px-3 py-1 rounded-full text-xs">
                        🔒 Under NDA
                      </div>
                    )}
                  </motion.div>

                  <div className="absolute right-4 md:right-8 top-1/2 transform -translate-y-1/2 hidden sm:block">
                    <motion.div
                      className="w-48 h-60 md:w-80 md:h-96 rounded-2xl overflow-hidden shadow-2xl"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.6, delay: 0.4 }}
                    >
                      <img 
                        src={placeholderProject} 
                        alt="Project Preview"
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                  </div>
                </div>

                <div className="absolute bottom-4 md:bottom-6 left-4 md:left-8 z-30 flex space-x-2">
                  {portfolioSlides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => goToSlide(index)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        index === currentSlide ? 'bg-white' : 'bg-white/40'
                      }`}
                    />
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Portfolio;

