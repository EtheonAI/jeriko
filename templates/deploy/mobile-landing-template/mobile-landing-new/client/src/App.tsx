import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navigation from "./components/Navigation";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Features from "./pages/Features";
import Screenshots from "./pages/Screenshots";
import HelpCenter from "./pages/HelpCenter";
import ScrollToAnchor from "./components/ScrollToAnchor";
import DownloadSection from "./components/DownloadSection";
import StatsSection from "./components/StatsSection";

function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <ScrollToAnchor />
      <Navigation />
      <main className="flex-grow">
        <Home />
        <StatsSection />
        <Features />
        <Screenshots />
        <HelpCenter />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={HomePage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

