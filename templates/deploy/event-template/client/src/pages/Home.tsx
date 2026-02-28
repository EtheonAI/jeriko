import NavBar from "@/components/LeftNavigation";
import Hero from "@/components/Hero";
import Schedule from "@/components/Events";
import People from "@/components/People";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import Location from "@/components/Location";
import RSVP from "@/components/RSVP";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main>
        <Hero />
        <Schedule />
        <People />
        <Location />
        <FAQ />
        <RSVP />
        <Footer />
      </main>
    </div>
  );
}

