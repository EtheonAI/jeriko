import Navigation from '@/components/Navigation';
import Hero from '@/components/Hero';
import TrustedBrands from '@/components/TrustedBrands';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import Testimonials from '@/components/Testimonials';
import Pricing from '@/components/Pricing';
import FinalCTA from '@/components/FinalCTA';
import Footer from '@/components/Footer';
import ScrollToAnchor from '@/components/ScrollToAnchor';

export default function Home() {
  return (
    <>
      <ScrollToAnchor />
      <div className="min-h-screen bg-gray-900 text-white">
        <Navigation />
        <main>
          <Hero />
          <TrustedBrands />
          <Features />
          <HowItWorks />
          <Testimonials />
          <Pricing />
          <FinalCTA />
        </main>
        <Footer />
      </div>
    </>
  );
}

