import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import SponsoredBy from "@/components/SponsoredBy";
import AboutEvent from "@/components/AboutEvent";
import OurStats from "@/components/OurStats";
import EventContent from "@/components/EventContent";
import Faq from "@/components/Faq";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <SponsoredBy />
      <AboutEvent />
      <OurStats />
      <EventContent />
      <Faq />
      <Footer />
    </>
  );
}

