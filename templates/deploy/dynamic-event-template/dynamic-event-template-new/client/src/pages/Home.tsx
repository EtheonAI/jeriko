import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users, Mic, Presentation, Trophy, Lightbulb, Network, Quote, Menu, X } from 'lucide-react';
import Marquee from "react-fast-marquee";

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrollY > 50 ? 'bg-background/90 backdrop-blur-xl shadow-2xl border-b border-border' : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-2 cursor-pointer hover:scale-105 transition-transform duration-200"
                 onClick={() => scrollToSection('hero')}>
              <div className="w-8 h-8 bg-red-accent rounded-md flex items-center justify-center hover:bg-red-accent/80 transition-colors duration-200">
                <div className="w-4 h-4 bg-white rounded-sm"></div>
              </div>
              <span className="text-xl font-bold text-foreground">EventHub</span>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {/* Navigation links removed */}
            </nav>
            
            {/* CTA Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              <Button variant="outline" className="border-border text-foreground bg-secondary/50 backdrop-blur-sm hover:bg-red-accent hover:text-white hover:border-red-accent hover:scale-105 transition-all duration-200 hover:shadow-md">
                Learn More
              </Button>
              <Button className="bg-red-accent hover:bg-red-accent/80 text-white hover:scale-105 transition-all duration-200 hover:shadow-lg">
                Register Now
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2 rounded-md hover:bg-secondary/50 transition-colors duration-200"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="md:hidden py-4 border-t border-border bg-card/90 backdrop-blur-xl animate-in slide-in-from-top duration-200">
              <nav className="flex flex-col space-y-4">
                {/* Navigation links removed */}
                <div className="flex flex-col space-y-2 pt-4">
                  <Button variant="outline" className="w-full border-border text-foreground bg-secondary/50 backdrop-blur-sm hover:bg-red-accent hover:text-white hover:border-red-accent">Learn More</Button>
                  <Button className="w-full bg-red-accent hover:bg-red-accent/80 text-white">Register Now</Button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section id="hero" className="relative min-h-screen bg-gradient-to-br from-background via-card to-background overflow-hidden">
        {/* Animated decorative shapes - hidden on mobile */}
        <div className="absolute inset-0 pointer-events-none z-10 hidden md:block">
          {/* Bottom left - square */}
          <div className="absolute bottom-16 left-8 w-12 h-12 bg-red-accent rounded-lg rotate-12 opacity-90 animate-pulse hover:scale-110 transition-transform duration-300"></div>
          
          {/* Top right - circle */}
          <div className="absolute top-16 right-1/3 w-12 h-12 bg-red-accent rounded-full opacity-90 animate-bounce hover:scale-110 transition-transform duration-300"></div>
          
          {/* Middle left - rotated square */}
          <div className="absolute top-1/3 left-8 w-20 h-20 bg-red-accent rounded-lg rotate-45 opacity-90 animate-pulse hover:scale-110 transition-transform duration-300"></div>
          
          {/* Middle right - small circle */}
          <div className="absolute top-1/3 right-20 w-10 h-10 bg-red-accent rounded-full opacity-90 animate-bounce hover:scale-110 transition-transform duration-300"></div>
          
          {/* Bottom right - rectangle */}
          <div className="absolute bottom-20 right-12 w-24 h-16 bg-red-accent rounded-lg -rotate-12 opacity-90 animate-pulse hover:scale-110 transition-transform duration-300"></div>
        </div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-screen flex items-center justify-center">
          <div className="text-center">
            {/* Logo icon */}
            <div className="flex justify-center mb-8">
              <div className="w-20 h-20 bg-red-accent rounded-xl flex items-center justify-center hover:scale-110 hover:rotate-6 transition-all duration-300 cursor-pointer">
                <div className="w-10 h-10 bg-white rounded-lg"></div>
              </div>
            </div>
            
            {/* Main heading with animation */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 animate-in fade-in slide-in-from-bottom duration-1000">
              JOIN US <span className="italic font-light">at</span> TECHCONNECT
              <br />
              SUMMIT 2024
            </h1>
            
            {/* Subheading */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom duration-1000 delay-200">
              Connect with industry leaders, innovators, and visionaries at the premier 
              networking event for professionals shaping the future of technology and business.
            </p>
            
            {/* Event details */}
            <div className="flex flex-col md:flex-row items-center justify-center space-y-4 md:space-y-0 md:space-x-12 mb-12 animate-in fade-in slide-in-from-bottom duration-1000 delay-400">
              <div className="flex items-center space-x-3 text-foreground hover:scale-105 transition-transform duration-200">
                <MapPin className="w-6 h-6 text-red-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">EVENT VENUE</p>
                  <p className="font-semibold">San Francisco, CA</p>
                </div>
              </div>
              <div className="flex items-center space-x-3 text-foreground hover:scale-105 transition-transform duration-200">
                <Calendar className="w-6 h-6 text-red-accent" />
                <div>
                  <p className="text-sm text-muted-foreground">EVENT DATE</p>
                  <p className="font-semibold">March 15-17, 2024</p>
                </div>
              </div>
            </div>
            
            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 animate-in fade-in slide-in-from-bottom duration-1000 delay-600">
              <Button size="lg" className="bg-red-accent hover:bg-red-accent/80 text-white px-8 py-3 hover:scale-105 transition-all duration-200 hover:shadow-xl">
                Register Now
              </Button>
              <Button size="lg" variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white px-8 py-3 hover:scale-105 transition-all duration-200 hover:shadow-xl">
                Become A Sponsor
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Speakers */}
      <section id="speakers" className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-16">
            <div className="flex items-center space-x-4">
              <h2 className="text-4xl md:text-5xl font-bold text-foreground">SPEAKERS</h2>
              <span className="text-2xl font-bold text-red-accent animate-pulse">14</span>
            </div>
            <div className="text-right">
              <span className="text-3xl md:text-4xl font-light italic text-muted-foreground">at</span>
              <span className="text-3xl md:text-4xl font-bold text-foreground ml-2">EVENT</span>
            </div>
          </div>
          
          <Marquee gradient={false} speed={50} className="mb-8">
            {/* Speaker Card 1 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face" 
                  alt="Alex Rivera" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">ALEX RIVERA, TECH ENTREPRENEUR</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">THE FUTURE OF NETWORKING</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>
            
            {/* Speaker Card 2 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&crop=face" 
                  alt="Sarah Chen" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">SARAH CHEN, AI STRATEGIST</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">AI-DRIVEN BUSINESS TRANSFORMATION</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>
            
            {/* Speaker Card 3 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face" 
                  alt="Maya Patel" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">MAYA PATEL, INNOVATION LEADER</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">BUILDING INCLUSIVE TECH COMMUNITIES</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>

            {/* Speaker Card 4 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&h=400&fit=crop&crop=face" 
                  alt="Marcus Johnson" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">MARCUS JOHNSON, STARTUP FOUNDER</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">SCALING BREAKTHROUGH INNOVATIONS</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>

            {/* Speaker Card 5 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&h=400&fit=crop&crop=face" 
                  alt="Emma Davis" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">EMMA DAVIS, DIGITAL STRATEGIST</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">DIGITAL TRANSFORMATION MASTERY</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>

            {/* Speaker Card 6 */}
            <div className="bg-red-accent/20 border border-red-accent/30 rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer group mx-4 w-80 h-[500px] flex flex-col">
              <div className="h-64 overflow-hidden">
                <img 
                  src="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&h=400&fit=crop&crop=face" 
                  alt="David Kim" 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <p className="text-sm font-semibold text-red-accent mb-1">DAVID KIM, PRODUCT VISIONARY</p>
                <h3 className="text-2xl font-bold text-foreground mb-4 flex-1">DESIGNING THE FUTURE OF TECH</h3>
                <Button variant="outline" className="border-red-accent text-red-accent bg-transparent hover:bg-red-accent hover:text-white hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>
          </Marquee>
        </div>
      </section>

      {/* SpeakerHeroImage */}
      <section className="relative h-96 md:h-[500px] overflow-hidden group">
        <img 
          src="/speaker-hero.webp" 
          alt="Speaker presenting to audience" 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors duration-300"></div>
      </section>

      {/* Statistics */}
      <section id="stats" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">WHY ATTEND</h2>
              <p className="text-lg text-muted-foreground">
                Connect with visionary leaders, discover breakthrough innovations, 
                and accelerate your professional growth. Experience cutting-edge 
                insights, meaningful networking, and transformative workshops.
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center group hover:scale-105 transition-transform duration-300">
                <Mic className="w-8 h-8 text-red-accent mx-auto mb-2 group-hover:scale-110 transition-transform duration-200" />
                <p className="text-sm text-muted-foreground mb-1">SPEAKERS</p>
                <p className="text-4xl md:text-5xl font-bold text-red-accent group-hover:text-red-accent/80 transition-colors duration-200">25</p>
              </div>
              <div className="text-center group hover:scale-105 transition-transform duration-300">
                <Presentation className="w-8 h-8 text-red-accent mx-auto mb-2 group-hover:scale-110 transition-transform duration-200" />
                <p className="text-sm text-muted-foreground mb-1">SESSIONS</p>
                <p className="text-4xl md:text-5xl font-bold text-red-accent group-hover:text-red-accent/80 transition-colors duration-200">45</p>
              </div>
              <div className="text-center group hover:scale-105 transition-transform duration-300">
                <Users className="w-8 h-8 text-red-accent mx-auto mb-2 group-hover:scale-110 transition-transform duration-200" />
                <p className="text-sm text-muted-foreground mb-1">ATTENDEES</p>
                <p className="text-4xl md:text-5xl font-bold text-red-accent group-hover:text-red-accent/80 transition-colors duration-200">750+</p>
              </div>
              <div className="text-center group hover:scale-105 transition-transform duration-300">
                <Network className="w-8 h-8 text-red-accent mx-auto mb-2 group-hover:scale-110 transition-transform duration-200" />
                <p className="text-sm text-muted-foreground mb-1">WORKSHOPS</p>
                <p className="text-4xl md:text-5xl font-bold text-red-accent group-hover:text-red-accent/80 transition-colors duration-200">12</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EventOverview */}
      <section id="events" className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground">EVENT</h2>
            <div className="text-right">
              <span className="text-3xl md:text-4xl font-bold text-foreground">OVERVIEW</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Event Card 1 */}
            <div className="bg-background border border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="overflow-hidden">
                <img 
                  src="/tech-conference.webp" 
                  alt="TechSprint Event" 
                  className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="bg-gradient-to-br from-red-accent to-red-accent/80 p-6 text-white">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">DAY 02 • KEYNOTE</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">STARTS FROM 10:00</span>
                  </div>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  INNOVATION SHOWCASE: FUTURE OF NETWORKING
                </h3>
                <Button variant="outline" className="border-white text-white bg-transparent hover:bg-white hover:text-red-accent hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>
            
            {/* Event Card 2 */}
            <div className="bg-background border border-border rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="overflow-hidden">
                <img 
                  src="/developer-conference.webp" 
                  alt="DevLeap Event" 
                  className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <div className="bg-gradient-to-br from-red-accent to-red-accent/80 p-6 text-white">
                <div className="flex items-center space-x-4 mb-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">DAY 03 • WORKSHOP</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">STARTS FROM 14:00</span>
                  </div>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold mb-4">
                  MASTERCLASS: BUILDING STRATEGIC PARTNERSHIPS
                </h3>
                <Button variant="outline" className="border-white text-white bg-transparent hover:bg-white hover:text-red-accent hover:scale-105 transition-all duration-200">
                  Learn More
                </Button>
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <Button className="bg-red-accent hover:bg-red-accent/80 text-white px-8 py-3 hover:scale-105 transition-all duration-200 hover:shadow-lg">
              View All Events
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonial" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-foreground">REVIEW</h2>
            <div className="text-right">
              <span className="text-3xl md:text-4xl font-light italic text-muted-foreground">of</span>
              <span className="text-3xl md:text-4xl font-bold text-foreground ml-2">ATTENDEE</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative group">
              <div className="overflow-hidden rounded-2xl">
                <img 
                  src="/conference-audience.webp" 
                  alt="Conference speaker" 
                  className="w-full h-96 object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>
            
            <div>
              <Quote className="w-16 h-16 text-red-accent mb-6 hover:scale-110 transition-transform duration-300" />
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-6 hover:text-red-accent transition-colors duration-300">
                INCREDIBLE NETWORKING OPPORTUNITIES AT TECHCONNECT.
              </h3>
              <div>
                <p className="font-semibold text-foreground">SARAH MARTINEZ</p>
                <p className="text-muted-foreground">SENIOR TECHNOLOGY CONSULTANT</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* AtAGlance */}
      <section id="glance" className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative group">
              <div className="overflow-hidden rounded-2xl">
                <img 
                  src="/conference-audience.webp" 
                  alt="Conference audience" 
                  className="w-full h-96 object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            </div>
            
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">AT A GLANCE</h2>
              <p className="text-lg text-muted-foreground mb-8">
                Experience world-class speakers, interactive workshops, and meaningful 
                connections that will accelerate your career and expand your professional network.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
                <div className="flex items-center space-x-3 hover:scale-105 transition-transform duration-200 cursor-pointer">
                  <Clock className="w-6 h-6 text-red-accent" />
                  <span className="font-medium text-foreground">Cutting-Edge Keynotes</span>
                </div>
                <div className="flex items-center space-x-3 hover:scale-105 transition-transform duration-200 cursor-pointer">
                  <Network className="w-6 h-6 text-red-accent" />
                  <span className="font-medium text-foreground">Networking Hacking</span>
                </div>
                <div className="flex items-center space-x-3 hover:scale-105 transition-transform duration-200 cursor-pointer">
                  <Lightbulb className="w-6 h-6 text-red-accent" />
                  <span className="font-medium text-foreground">Hands-On Workshops</span>
                </div>
                <div className="flex items-center space-x-3 hover:scale-105 transition-transform duration-200 cursor-pointer">
                  <Calendar className="w-6 h-6 text-red-accent" />
                  <span className="font-medium text-foreground">Hackathons</span>
                </div>
                <div className="flex items-center space-x-3 hover:scale-105 transition-transform duration-200 cursor-pointer">
                  <Trophy className="w-6 h-6 text-red-accent" />
                  <span className="font-medium text-foreground">Startup Showcase</span>
                </div>
              </div>
              
              <Button className="bg-red-accent hover:bg-red-accent/80 text-white px-8 py-3 hover:scale-105 transition-all duration-200 hover:shadow-lg mb-8">
                Join Our Community
              </Button>

            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background border-t border-border text-foreground py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4 hover:scale-105 transition-transform duration-200 cursor-pointer">
              <div className="w-8 h-8 bg-red-accent rounded-md flex items-center justify-center hover:bg-red-accent/80 transition-colors duration-200">
                <div className="w-4 h-4 bg-white rounded-sm"></div>
              </div>
              <span className="text-xl font-bold">EventHub</span>
            </div>
            <p className="text-muted-foreground hover:text-foreground transition-colors duration-200">TechConnect Summit 2024 - Where Innovation Meets Opportunity</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

