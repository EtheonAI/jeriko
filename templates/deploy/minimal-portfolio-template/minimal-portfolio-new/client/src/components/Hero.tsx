import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const Hero = () => {
  const heroRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const subheadingRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      
      tl.fromTo([headingRef.current, subheadingRef.current, descriptionRef.current, ctaRef.current], 
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.8, stagger: 0.2 }
      );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={heroRef} className="relative pt-32 pb-20 px-6 min-h-screen flex items-center">
      <div className="max-w-6xl mx-auto">
        <h1 
          ref={headingRef}
          className="text-6xl md:text-8xl lg:text-9xl font-medium mb-4 leading-tight"
          style={{ fontWeight: 500, color: 'var(--brand-accent)' }}
        >
          Hi, I'm NAME,
        </h1>
        <h2 
          ref={subheadingRef}
          className="text-4xl md:text-6xl lg:text-7xl font-medium mb-8 leading-tight max-w-5xl"
          style={{ fontWeight: 500, color: 'var(--brand-dark)' }}
        >
          UI/UX Designer crafting<br />
          intuitive digital experiences.
        </h2>
        <p 
          ref={descriptionRef}
          className="text-lg md:text-xl mb-12 max-w-4xl leading-relaxed"
          style={{ fontWeight: 400, color: 'var(--brand-dark)' }}
        >
          I have <span className="font-semibold" style={{ color: 'var(--brand-accent)' }}>8+ years of experience</span> creating user-centered designs for web and mobile applications. I specialize in transforming complex problems into elegant, accessible solutions that users love.
        </p>
        <div 
          ref={ctaRef}
          className="flex flex-col sm:flex-row gap-6 items-start sm:items-center"
        >
          <button 
            className="px-8 py-4 text-lg rounded-full transition-all duration-300 font-medium hover:scale-105 hover:shadow-lg"
            style={{ backgroundColor: 'var(--brand-dark)', color: 'var(--brand-light)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-accent)';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-dark)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onClick={() => {
              const portfolioSection = document.querySelector('[data-section="portfolio"]');
              if (portfolioSection) {
                portfolioSection.scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            }}
          >
            View my work
          </button>
          <button 
            className="text-lg underline underline-offset-4 transition-colors duration-200 flex items-center gap-2"
            style={{ color: 'var(--brand-dark)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand-accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--brand-dark)'}
            onClick={() => {
              const contactSection = document.querySelector('[data-section="contact"]');
              if (contactSection) {
                contactSection.scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'start'
                });
              }
            }}
          >
            or get in touch
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 13l3 3 7-7"/>
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;

