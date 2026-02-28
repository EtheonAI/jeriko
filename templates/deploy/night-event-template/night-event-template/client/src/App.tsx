import { useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import Hero from './components/Hero'
import Content from './components/Content'
import './App.css'

function App() {
  const lenisRef = useRef<Lenis | null>(null)
  const [activeSection, setActiveSection] = useState('home')

  useEffect(() => {
    // Initialize Lenis smooth scroll for the scrollable content
    const wrapper = document.querySelector('[data-lenis-scroll]')
    const content = document.querySelector('[data-lenis-content]')
    
    if (wrapper && content) {
      lenisRef.current = new Lenis({
        wrapper: wrapper as HTMLElement,
        content: content as HTMLElement,
      })

      const raf = (time: number) => {
        lenisRef.current?.raf(time)
        requestAnimationFrame(raf)
      }

      requestAnimationFrame(raf)
    }

    return () => {
      lenisRef.current?.destroy()
    }
  }, [])

  const handleNavigationChange = (sectionId: string) => {
    setActiveSection(sectionId)
  }

  return (
    <div className="flex h-screen w-screen max-lg:flex-col">
      <Hero onNavigationChange={handleNavigationChange} />
      <Content activeSection={activeSection} />
    </div>
  )
}

export default App

