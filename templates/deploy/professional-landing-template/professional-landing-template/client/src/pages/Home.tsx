import Navigation from '@/components/Navigation'
import Hero from '@/components/Hero'
import MarqueeSeparator from '@/components/MarqueeSeparator'
import About from '@/components/About'
import Quote from '@/components/Quote'
import Services from '@/components/Services'
import Testimonials from '@/components/Testimonials'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main>
        <Hero />
        <MarqueeSeparator />
        <About />
        <Quote />
        <Services />
        <Testimonials />
      </main>
      <Footer />
    </div>
  )
}

