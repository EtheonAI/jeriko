import Hero from "@/components/Hero";
import Features from "@/components/Features";
import Integrations from "@/components/Integrations";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      <Hero />
      <Features />
      <Integrations />
      <Footer />
    </main>
  );
}
