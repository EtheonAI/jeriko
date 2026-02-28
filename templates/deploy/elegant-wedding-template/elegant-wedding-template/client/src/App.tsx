import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navigation from "./components/wedding/Navigation";
import Hero from "./components/wedding/Hero";
import MessageFromCouple from "./components/wedding/MessageFromCouple";
import Location from "./components/wedding/Location";
import Timeline from "./components/wedding/Timeline";
import FAQ from "./components/wedding/FAQ";
import MessageBlock from "./components/wedding/MessageBlock";
import Footer from "./components/wedding/Footer";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <div className="App">
            <Navigation />
            <Hero />
            <MessageFromCouple />
            <Location />
            <Timeline />
            <FAQ />
            <MessageBlock />
            <Footer />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

