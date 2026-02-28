import React, { useCallback, useMemo } from 'react'
import Particles from '@tsparticles/react'
import { loadAll } from '@tsparticles/all'
import { useIsMobile } from '../hooks/use-mobile'

const ParticleBackground = () => {
  const isMobile = useIsMobile()
  
  const particlesInit = useCallback(async (engine) => {
    await loadAll(engine)
  }, [])

  const particlesLoaded = useCallback(async (container) => {
    // Particles loaded callback
  }, [])

  // Optimize particle configuration for mobile
  const particleOptions = useMemo(() => ({
    background: {
      color: {
        value: "transparent",
      },
    },
    fpsLimit: isMobile ? 30 : 60, // Reduce FPS on mobile
    interactivity: {
      events: {
        onClick: {
          enable: !isMobile, // Disable click interactions on mobile
          mode: "push",
        },
        onHover: {
          enable: !isMobile, // Disable hover interactions on mobile
          mode: "repulse",
        },
        resize: true,
      },
      modes: {
        push: {
          quantity: isMobile ? 2 : 4,
        },
        repulse: {
          distance: isMobile ? 100 : 200,
          duration: 0.4,
        },
      },
    },
    particles: {
      color: {
        value: ["#ffffff", "#FFD3AC", "#FFD3AC", "#FFE8D6", "#fbbf24", "#fcd34d"],
      },
      links: {
        color: "#FFD3AC",
        distance: isMobile ? 100 : 150, // Reduce link distance on mobile
        enable: !isMobile, // Disable links on mobile for better performance
        opacity: 0.4,
        width: 1,
      },
      move: {
        direction: "none",
        enable: true,
        outModes: {
          default: "bounce",
        },
        random: false,
        speed: isMobile ? 1 : 2, // Slower movement on mobile
        straight: false,
      },
      number: {
        density: {
          enable: true,
          area: isMobile ? 1200 : 800, // Lower density on mobile
        },
        value: isMobile ? 30 : 80, // Fewer particles on mobile
      },
      opacity: {
        value: isMobile ? 0.4 : 0.6, // Lower opacity on mobile
        random: {
          enable: true,
          minimumValue: 0.2,
        },
        animation: {
          enable: !isMobile, // Disable opacity animation on mobile
          speed: 1.5,
          minimumValue: 0.2,
          sync: false,
        },
      },
      shape: {
        type: isMobile ? ["circle"] : ["circle", "triangle", "polygon"], // Simpler shapes on mobile
        options: {
          polygon: {
            sides: 6,
          },
        },
      },
      size: {
        value: { min: 1, max: isMobile ? 3 : 5 }, // Smaller particles on mobile
        random: {
          enable: true,
          minimumValue: 1,
        },
        animation: {
          enable: !isMobile, // Disable size animation on mobile
          speed: 2,
          minimumValue: 1,
          sync: false,
        },
      },
    },
    detectRetina: true,
    fullScreen: {
      enable: false,
    },
    style: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      zIndex: 1,
    },
  }), [isMobile])

  // Don't render particles on very small screens for performance
  if (typeof window !== 'undefined' && window.innerWidth < 480) {
    return null
  }

  return (
    <Particles
      id="tsparticles"
      init={particlesInit}
      loaded={particlesLoaded}
      options={particleOptions}
    />
  )
}

export default ParticleBackground