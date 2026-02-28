import { useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import About from './components/sections/About';
import Resume from './components/sections/Resume';
import Portfolio from './components/sections/Portfolio';
import Blog from './components/sections/Blog';

function App() {
  const [activeSection, setActiveSection] = useState('about');

  // Function to dynamically render the appropriate section based on activeSection state
  const renderSection = () => {
    switch (activeSection) {
      case 'about':
        return <About />;
      case 'resume':
        return <Resume />;
      case 'portfolio':
        return <Portfolio />;
      case 'blog':
        return <Blog />;
      default:
        return <About />; // Fallback to About section if no valid section is selected
    }
  };

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <div className="portfolio-container">
            <main className="portfolio-main">
              <Sidebar />
              <div className="main-content">
                <Navbar activeSection={activeSection} setActiveSection={setActiveSection} />
                {renderSection()}
              </div>
            </main>
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

