import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navigation from './components/Navigation';
import Hero from './components/Hero';
import Introduction from './components/Introduction';
import Services from './components/Services';
import Portfolio from './components/Portfolio';
import Testimonials from './components/Testimonials';
import About from './components/About';
import Contact from './components/Contact';
import Footer from './components/Footer';
import BackToTop from './components/BackToTop';
import useDynamicTheme from './hooks/use-dynamic-theme';

function App() {
  const { navRef, mainRef } = useDynamicTheme();

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <div ref={mainRef} className="min-h-screen overflow-x-hidden">
            <Navigation ref={navRef} />
            <div data-section="hero" className="section-hero">
              <Hero />
            </div>
            <div data-section="introduction" className="section-dark">
              <Introduction />
            </div>
            <div data-section="services" className="section-dark">
              <Services />
            </div>
            <div data-section="portfolio" className="section-dark">
              <Portfolio />
            </div>
            <div data-section="testimonials" className="section-dark">
              <Testimonials />
            </div>
            <div data-section="about" className="section-dark">
              <About />
            </div>
            <div data-section="contact" className="section-light">
              <Contact />
            </div>
            <Footer />
            <BackToTop />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

