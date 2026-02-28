/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react'
import './App.css'

// Import components
import Header from './components/Header'
import Hero from './components/Hero'
import AboutEvent from './components/AboutEvent'
import Venue from './components/Venue'
import Schedule from './components/Schedule'
import Pricing from './components/Pricing'
import WhatToBring from './components/WhatToBring'
import BookingContact from './components/BookingContact'
import FAQ from './components/FAQ'
import Footer from './components/Footer'

function App() {
  return (
    <div className="min-h-screen font-satoshi">
      <Header />
      <Hero />
      <div id="about">
        <AboutEvent />
      </div>
      <div id="venue">
        <Venue />
      </div>
      <div id="schedule">
        <Schedule />
      </div>
      <div id="pricing">
        <Pricing />
      </div>
      <div id="prepare">
        <WhatToBring />
      </div>
      <div id="contact">
        <BookingContact />
      </div>
      <div id="faq">
        <FAQ />
      </div>
      <Footer />
    </div>
  )
}

export default App

