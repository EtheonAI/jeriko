import Header from '@/components/Header'
import HeroSection from '@/components/HeroSection'
import MissionSection from '@/components/MissionSection'
import ProgramsSection from '@/components/ProgramsSection'
import VolunteerSection from '@/components/VolunteerSection'
import WhyChooseUsSection from '@/components/WhyChooseUsSection'
import BlogSection from '@/components/BlogSection'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <MissionSection />
        <ProgramsSection />
        <VolunteerSection />
        <WhyChooseUsSection />
        <BlogSection />
      </main>
      <Footer />
    </div>
  )
}

