import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronUp, faChevronDown, faCalendarAlt, faBars, faTimes } from '@fortawesome/free-solid-svg-icons';
import TimelineCard from '../components/ui/TimelineCard';
import { useIsMobile } from '../hooks/use-mobile';

interface Event {
  startTime: string;
  endTime: string;
  date: string;
  title: string;
  description: string;
  type: string;
  location: string;
  duration: string;
  dontMiss?: boolean;
}

interface AgendaContentProps {
  theme: {
    bg: string;
    text: string;
    accent: string;
    gradient: string;
    shadow: string;
  };
}

function AgendaContent({ theme }: AgendaContentProps) {
  const [activeDate, setActiveDate] = useState('12 JUL');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [recentTimelineClick, setRecentTimelineClick] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const allEvents: Event[] = [
    // Day 1 - 12 JUL
    { 
      startTime: '12:00',
      endTime: '16:00',
      date: '12 JUL',
      title: 'Start The Soundwave', 
      description: 'Opening up the day with beats and good energy.', 
      type: 'music',
      location: 'Main Stage',
      duration: '4 Hours',
      dontMiss: true
    },
    { 
      startTime: '12:00',
      endTime: '14:00',
      date: '12 JUL',
      title: 'Groovory Taco Fiesta', 
      description: 'Bold, street-style tacos with flavor in every bite.', 
      type: 'food',
      location: 'Taco Truck',
      duration: '2 Hours'
    },
    { 
      startTime: '14:00',
      endTime: '15:00',
      date: '12 JUL',
      title: 'Street Art Creation Zone', 
      description: 'Live demo from local muralists creating street art.', 
      type: 'workshop',
      location: 'Art Wall Zone',
      duration: '1 Hour'
    },
    { 
      startTime: '16:00',
      endTime: '18:00',
      date: '12 JUL',
      title: 'Vinyl DJ Sessions', 
      description: 'Classic vinyl spinning with retro vibes and nostalgic beats.', 
      type: 'music',
      location: 'Retro Lounge',
      duration: '2 Hours'
    },
    { 
      startTime: '18:00',
      endTime: '20:00',
      date: '12 JUL',
      title: 'Craft Beer Garden', 
      description: 'Local breweries showcase their finest craft beers and ales.', 
      type: 'food',
      location: 'Beer Garden',
      duration: '2 Hours'
    },

    // Day 2 - 13 JUL
    { 
      startTime: '11:00',
      endTime: '13:00',
      date: '13 JUL',
      title: 'Morning Jazz Brunch', 
      description: 'Smooth jazz melodies paired with gourmet brunch delights.', 
      type: 'music',
      location: 'Jazz Pavilion',
      duration: '2 Hours',
      dontMiss: true
    },
    { 
      startTime: '13:00',
      endTime: '15:00',
      date: '13 JUL',
      title: 'Artisan Market', 
      description: 'Local craftspeople showcase handmade goods and unique creations.', 
      type: 'workshop',
      location: 'Market Square',
      duration: '2 Hours'
    },
    { 
      startTime: '15:00',
      endTime: '17:00',
      date: '13 JUL',
      title: 'Electronic Fusion', 
      description: 'Cutting-edge electronic music meets live instruments.', 
      type: 'music',
      location: 'Tech Stage',
      duration: '2 Hours'
    },
    { 
      startTime: '17:00',
      endTime: '19:00',
      date: '13 JUL',
      title: 'Global Street Food', 
      description: 'Taste authentic flavors from around the world in one place.', 
      type: 'food',
      location: 'Food Alley',
      duration: '2 Hours'
    },
    { 
      startTime: '19:00',
      endTime: '21:00',
      date: '13 JUL',
      title: 'Sunset Acoustic', 
      description: 'Intimate acoustic performances as the sun sets.', 
      type: 'music',
      location: 'Sunset Deck',
      duration: '2 Hours',
      dontMiss: true
    },

    // Day 3 - 14 JUL
    { 
      startTime: '10:00',
      endTime: '12:00',
      date: '14 JUL',
      title: 'Kids Creative Workshop', 
      description: 'Fun art and music activities designed for young creators.', 
      type: 'workshop',
      location: 'Kids Zone',
      duration: '2 Hours'
    },
    { 
      startTime: '12:00',
      endTime: '14:00',
      date: '14 JUL',
      title: 'Hip-Hop Cypher', 
      description: 'Raw talent showcase with freestyle battles and breakdancing.', 
      type: 'music',
      location: 'Urban Stage',
      duration: '2 Hours',
      dontMiss: true
    },
    { 
      startTime: '14:00',
      endTime: '16:00',
      date: '14 JUL',
      title: 'Dessert Paradise', 
      description: 'Indulgent sweets and treats from top pastry chefs.', 
      type: 'food',
      location: 'Sweet Corner',
      duration: '2 Hours'
    },
    { 
      startTime: '16:00',
      endTime: '18:00',
      date: '14 JUL',
      title: 'Photography Workshop', 
      description: 'Learn street photography techniques from professional photographers.', 
      type: 'workshop',
      location: 'Photo Studio',
      duration: '2 Hours'
    },
    { 
      startTime: '18:00',
      endTime: '20:00',
      date: '14 JUL',
      title: 'Grand Finale Concert', 
      description: 'Epic closing performance featuring all festival headliners.', 
      type: 'music',
      location: 'Main Stage',
      duration: '2 Hours',
      dontMiss: true
    },
    { 
      startTime: '20:00',
      endTime: '22:00',
      date: '14 JUL',
      title: 'After Party Vibes', 
      description: 'Keep the energy going with late-night beats and dancing.', 
      type: 'music',
      location: 'Night Club',
      duration: '2 Hours'
    }
  ];

  const timelineData = [
    { date: '12 JUL', active: activeDate === '12 JUL' },
    { date: '13 JUL', active: activeDate === '13 JUL' },
    { date: '14 JUL', active: activeDate === '14 JUL' }
  ];

  // Utility functions
  const formatTime = (time24: string) => {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatTimeRange = (startTime: string, endTime: string) => {
    return `${formatTime(startTime)} - ${formatTime(endTime)}`;
  };

  // Filter and sort events by active date chronologically
  const filteredEvents = allEvents
    .filter(event => event.date === activeDate)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Get day number for display
  const getDayNumber = (date: string) => {
    const dayMap: Record<string, string> = { '12 JUL': '1ST', '13 JUL': '2ND', '14 JUL': '3RD' };
    return dayMap[date] || '1ST';
  };

  // Get time range for the day
  const getTimeRange = (date: string) => {
    const events = allEvents.filter(event => event.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (events.length === 0) return '12-10 PM';
    
    const earliestStart = events[0].startTime;
    const latestEnd = events[events.length - 1].endTime;
    
    return `${formatTime(earliestStart).split(' ')[0]}-${formatTime(latestEnd)}`;
  };

  // Generate timeline points for the active day
  const generateTimelinePoints = (events: Event[]) => {
    const uniqueTimes = Array.from(new Set(events.map(event => event.startTime))).sort();
    return uniqueTimes.map(time => ({
      time24: time,
      displayTime: formatTime(time),
      shortTime: formatTime(time).replace(':00', '').replace(' ', '')
    }));
  };

  // Scroll to specific event
  const scrollToEvent = (targetTime: string) => {
    const eventElements = document.querySelectorAll('[data-event-time]');
    const targetElement = Array.from(eventElements).find(el => 
      el.getAttribute('data-event-time') === targetTime
    );
    
    if (targetElement && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const elementTop = (targetElement as HTMLElement).offsetTop - container.offsetTop;
      const offset = 100; // Add some padding from top
      
      // Set flag to prevent auto-scroll triggering immediately after timeline click
      setRecentTimelineClick(true);
      
      container.scrollTo({
        top: elementTop - offset,
        behavior: 'smooth'
      });
      
      // Clear the flag after a delay to allow normal auto-scroll behavior later
      setTimeout(() => {
        setRecentTimelineClick(false);
      }, 2000); // 2 second buffer
    }
  };

  const timelinePoints = generateTimelinePoints(filteredEvents);

  // Get next available date
  const getNextDate = (currentDate: string) => {
    const dates = ['12 JUL', '13 JUL', '14 JUL'];
    const currentIndex = dates.indexOf(currentDate);
    return currentIndex < dates.length - 1 ? dates[currentIndex + 1] : null;
  };

  // Get previous available date
  const getPreviousDate = (currentDate: string) => {
    const dates = ['12 JUL', '13 JUL', '14 JUL'];
    const currentIndex = dates.indexOf(currentDate);
    return currentIndex > 0 ? dates[currentIndex - 1] : null;
  };

  // Handle scroll detection for auto-switching days
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    let scrollTimeout: NodeJS.Timeout | null = null;
    let lastScrollTop = 0;

    const handleScroll = () => {
      if (isAutoScrolling || recentTimelineClick) return; // Prevent triggering during auto-scroll or recent timeline click

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      const isScrollingDown = scrollTop > lastScrollTop;
      const isScrollingUp = scrollTop < lastScrollTop;
      
      // Clear any existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Use a small delay to avoid too frequent triggers
      scrollTimeout = setTimeout(() => {
        // More intelligent scroll down detection - only trigger if:
        // 1. User is actively scrolling down
        // 2. They've reached very close to the bottom (95% instead of 85%)
        // 3. There's actually content below to scroll to
        if (isScrollingDown && scrollPercentage >= 0.95) {
          const nextDate = getNextDate(activeDate);
          if (nextDate) {
            setIsAutoScrolling(true);
            setActiveDate(nextDate);
            
            // Reset scroll to top after transition
            setTimeout(() => {
              if (scrollContainer) {
                scrollContainer.scrollTop = 0;
                setTimeout(() => setIsAutoScrolling(false), 100);
              }
            }, 300);
          }
        }
        
        // Scroll up to previous day (when at very top)
        else if (isScrollingUp && scrollTop <= 20) {
          const previousDate = getPreviousDate(activeDate);
          if (previousDate) {
            setIsAutoScrolling(true);
            setActiveDate(previousDate);
            
            // Set scroll to bottom of previous day after transition
            setTimeout(() => {
              if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight - scrollContainer.clientHeight - 100;
                setTimeout(() => setIsAutoScrolling(false), 100);
              }
            }, 300);
          }
        }
      }, 200); // Slightly longer delay for more stable behavior

      lastScrollTop = scrollTop;
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
    };
  }, [activeDate, isAutoScrolling, recentTimelineClick]);

  // Reset scroll position when manually changing dates
  const handleDateClick = (date: string) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setActiveDate(date);
    setIsAutoScrolling(false);
    setRecentTimelineClick(false); // Clear timeline click flag
    // Close sidebar on mobile after selection
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  // Handle timeline point click
  const handleTimelineClick = (targetTime: string) => {
    scrollToEvent(targetTime);
    // Close sidebar on mobile after selection
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-full relative">
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`fixed top-4 left-4 z-50 p-3 rounded-full ${theme.bg} text-white shadow-lg transition-all duration-300 hover:scale-110`}
          aria-label="Toggle menu"
        >
          <FontAwesomeIcon 
            icon={isSidebarOpen ? faTimes : faBars} 
            className="text-lg"
          />
        </button>
      )}

      {/* Mobile Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 transition-opacity duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Timeline Sidebar */}
      <div className={`
        ${isMobile ? 'fixed left-0 top-0 h-full z-40 transform transition-transform duration-300' : 'relative'}
        ${isMobile && !isSidebarOpen ? '-translate-x-full' : 'translate-x-0'}
        ${isMobile ? 'w-72' : 'w-80'} 
        bg-gray-50 ${isMobile ? 'p-6' : 'p-8'} border-r border-gray-200
        ${isMobile ? 'shadow-xl' : ''}
        ${isMobile ? 'overflow-y-auto' : ''}
      `}>
        {/* Dates */}
        <div className="mb-12">
          {timelineData.map((item, index) => (
            <div 
              key={index} 
              className={`mb-6 cursor-pointer transition-all duration-300 hover:scale-105 ${
                item.active ? theme.text : 'text-gray-400 hover:text-gray-600'
              }`}
              onClick={() => handleDateClick(item.date)}
            >
              <div className={`text-2xl font-bold font-['Ranchers'] ${
                item.active ? '' : 'opacity-50 hover:opacity-75'
              }`}>
                {item.date}
              </div>
            </div>
          ))}
        </div>

        {/* Day Header */}
        <div className={`${isMobile ? 'mb-6 mt-4' : 'mb-8'}`}>
          <h1 className={`${isMobile ? 'text-3xl' : 'text-4xl'} font-['Ranchers'] font-bold ${theme.text} mb-2 transition-all duration-500`}>
            {getDayNumber(activeDate)} DAY
          </h1>
          <div className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold ${theme.text} opacity-60 transition-all duration-500`}>
            {getTimeRange(activeDate)}
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline Line */}
          <div className={`absolute left-4 top-0 bottom-0 w-1 ${theme.bg} opacity-30`}></div>
          
          {/* Timeline Points */}
          <div className={`${isMobile ? 'space-y-6' : 'space-y-8'}`}>
            {timelinePoints.map((timePoint, index) => (
              <div 
                key={index} 
                className="relative flex items-center cursor-pointer group"
                onClick={() => handleTimelineClick(timePoint.time24)}
              >
                <div className={`${isMobile ? 'w-8 h-8' : 'w-10 h-10'} rounded-full ${theme.bg} flex items-center justify-center text-white font-bold ${isMobile ? 'text-xs' : 'text-xs'} z-10 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg`}>
                  {timePoint.shortTime.replace('AM', '').replace('PM', '')}
                </div>
                <div className="ml-4">
                  <div className={`text-base font-bold ${theme.text} transition-all duration-300 group-hover:scale-105`}>
                    {timePoint.displayTime}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Content Area */}
      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isMobile ? 'p-4 pt-20' : 'p-8'
        }`}
      >
        <div className={`${isMobile ? 'max-w-full' : 'max-w-4xl'}`}>
          {/* Previous Day Indicator */}
          {getPreviousDate(activeDate) && (
            <div className="text-center py-6 mb-6 border-b border-gray-200">
              <div className="flex items-center justify-center gap-3 text-gray-500 hover:text-gray-700 transition-colors duration-300">
                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1"></div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FontAwesomeIcon icon={faChevronUp} className="animate-bounce text-sm" />
                  <span>scroll up for</span>
                  <span className={`${theme.text} font-bold`}>{getPreviousDate(activeDate)}</span>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1"></div>
              </div>
            </div>
          )}

          {/* Event Count Header */}
          <div className="mb-6">
            <h2 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold ${theme.text} mb-2`}>
              {filteredEvents.length} Events on {activeDate}
            </h2>
            <div className="h-1 w-20 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full"></div>
          </div>

          {/* Events with smooth transition */}
          <div className="transition-all duration-500 ease-in-out">
            {filteredEvents.length > 0 ? (
              <>
                {filteredEvents.map((event, index) => (
                  <div 
                    key={`${event.date}-${index}`}
                    className="animate-fadeIn"
                    style={{ animationDelay: `${index * 100}ms` }}
                    data-event-time={event.startTime}
                  >
                    <TimelineCard
                      time={formatTimeRange(event.startTime, event.endTime)}
                      title={event.title}
                      description={event.description}
                      type={event.type}
                      location={event.location}
                      duration={event.duration}
                      dontMiss={event.dontMiss}
                      theme={theme}
                    />
                  </div>
                ))}
                
                {/* Next Day Indicator */}
                {getNextDate(activeDate) && (
                  <div className="text-center py-8 mt-8 border-t border-gray-200">
                    <div className="flex items-center justify-center gap-3 text-gray-500 hover:text-gray-700 transition-colors duration-300">
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1"></div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span>Scroll down for</span>
                        <span className={`${theme.text} font-bold`}>{getNextDate(activeDate)}</span>
                        <FontAwesomeIcon icon={faChevronDown} className="animate-bounce text-sm" />
                      </div>
                      <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent flex-1"></div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <FontAwesomeIcon icon={faCalendarAlt} className={`text-6xl mb-4 ${theme.text} opacity-50`} />
                <h3 className={`text-2xl font-bold ${theme.text} mb-2`}>No Events Scheduled</h3>
                <p className="text-gray-600">Check back later for updates!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgendaContent;

