import Header from '@/components/Header/Header'
import Hero from '@/components/Hero/Hero'
import About from '@/components/About/About'
import Projects from '@/components/Projects/Projects'
import Services from '@/components/Services/Services'
import Testimonials from '@/components/Testimonials/Testimonials'
import Articles from '@/components/Articles/Articles'
import FAQ from '@/components/FAQ/FAQ'
import CTA from '@/components/CTA/CTA'
import Footer from '@/components/Footer/Footer'

export default function Home() {
  return (
    <div className="min-h-screen" style={{backgroundColor: 'var(--dusty-blue-50)'}}>
      <Header />
      <main>
        <Hero />
        <About />
        <Projects />
        <Services />
        <Testimonials />
        <Articles />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}

