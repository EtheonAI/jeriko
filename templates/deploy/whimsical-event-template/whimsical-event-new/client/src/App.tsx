import { useState } from 'react';
import './index.css';
import AboutContent from './pages/AboutPage';
import AgendaContent from './pages/AgendaPage';
import TicketsContent from './pages/TicketsPage';
import { tabs } from './config/tabs';
import { getThemeClasses } from './utils/theme';
import { useIsMobile } from './hooks/use-mobile';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function AppContent() {
  const [activeTab, setActiveTab] = useState('about');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useIsMobile();

  const currentTheme = getThemeClasses(tabs.find(tab => tab.id === activeTab)?.theme || 'orange');

  const handleMobileTabSelect = (tabId: string) => {
    setActiveTab(tabId);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 font-['Space_Grotesk'] overflow-hidden">
      {/* Mobile Hamburger Menu */}
      {isMobile && (
        <>
          {/* Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="fixed top-4 right-4 z-50 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-all duration-300"
          >
            <div className="flex flex-col space-y-1">
              <div className={`w-6 h-0.5 bg-gray-800 transition-all duration-300 hamburger-line ${isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`}></div>
              <div className={`w-6 h-0.5 bg-gray-800 transition-all duration-300 hamburger-line ${isMobileMenuOpen ? 'opacity-0' : ''}`}></div>
              <div className={`w-6 h-0.5 bg-gray-800 transition-all duration-300 hamburger-line ${isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`}></div>
            </div>
          </button>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black bg-opacity-50 z-40 backdrop-enter"
                onClick={() => setIsMobileMenuOpen(false)}
              ></div>

              {/* Dropdown Menu */}
              <div className="fixed top-20 right-4 z-50 bg-white rounded-lg shadow-2xl overflow-hidden w-64 mobile-menu-enter">
                {tabs.map((tab) => {
                  const tabTheme = getThemeClasses(tab.theme);
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleMobileTabSelect(tab.id)}
                      className={`w-full px-6 py-5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors duration-200 border-l-4 touch-manipulation ${isActive ? 'border-orange-500 bg-gray-50' : 'border-transparent'
                        } ${isActive && tab.theme === 'purple' ? 'border-purple-500' : ''} ${isActive && tab.theme === 'blue' ? 'border-blue-500' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-['Ranchers'] font-bold text-lg text-gray-800">
                            {tab.label}
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {tab.id === 'about' && 'Learn about the festival'}
                            {tab.id === 'agenda' && 'View event schedule'}
                            {tab.id === 'tickets' && 'Get your tickets'}
                          </div>
                        </div>
                        <div className={`text-2xl font-['Ranchers'] font-bold ${tab.theme === 'orange' ? 'text-orange-500' :
                            tab.theme === 'purple' ? 'text-purple-500' :
                              tab.theme === 'blue' ? 'text-blue-500' : 'text-gray-400'
                          }`}>
                          {tab.number}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      <div className="flex h-screen">
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className={`absolute top-10 left-10 text-9xl font-['Ranchers'] text-gray-400 rotate-12 ${isMobile ? 'bg-pattern-mobile' : ''}`}>🎠</div>
            <div className={`absolute top-40 right-20 text-6xl font-['Ranchers'] text-gray-400 -rotate-12 ${isMobile ? 'bg-pattern-mobile' : ''}`}>🎡</div>
            <div className={`absolute bottom-20 left-40 text-7xl font-['Ranchers'] text-gray-400 rotate-45 ${isMobile ? 'bg-pattern-mobile' : ''}`}>🎪</div>
          </div>

          <div className={`h-full overflow-y-auto py-8 relative z-10 ${isMobile ? 'px-4' : ''}`}>
            {activeTab === 'about' && <AboutContent theme={currentTheme} />}
            {activeTab === 'agenda' && <AgendaContent theme={currentTheme} />}
            {activeTab === 'tickets' && <TicketsContent theme={currentTheme} />}
          </div>
        </div>

        {/* New Sidebar Design - Hidden on Mobile */}
        {!isMobile && (
          <div className="relative flex flex-col h-full">
            {/* Navigation Tabs */}
            <div className="flex h-full">
              {tabs.map((tab) => {
                const tabTheme = getThemeClasses(tab.theme);
                const isActive = activeTab === tab.id;

                return (
                  <div
                    key={tab.id}
                    className={`sidebar-tab w-24 ${tabTheme.bg} cursor-pointer relative overflow-hidden`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <div className="h-full flex flex-col text-white relative">
                      {/* Tab Label - Vertical text */}
                      <div className="flex-1 flex items-center justify-center min-h-0">
                        <div className="text-6xl font-['Ranchers'] font-bold tracking-wider transform -rotate-90 whitespace-nowrap origin-center translate-y-[-50px]">
                          {tab.label}
                        </div>
                      </div>
                      
                      {/* Bottom Number with Animation */}
                      <div className="relative flex items-end justify-center pb-8">
                        {/* Animated Vertical Line */}
                        <div className="line-slide absolute bottom-0 left-1/2 transform -translate-x-1/2 w-[1.5px] h-0 bg-white/30 transition-all duration-300 ease-out"></div>
                        
                        {/* Number */}
                        <div className="number-push text-6xl font-['Ranchers'] font-bold text-white/30">
                          {tab.number}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

