import { useEffect, useRef, useState, RefObject } from 'react'
import { annotate } from 'rough-notation'
import type { RoughAnnotationConfig } from 'rough-notation/lib/model'

type RoughAnnotation = ReturnType<typeof annotate>

/**
 * Custom hook for triggering rough notation animations when element comes into view
 * @param annotationConfig - Configuration for the rough notation annotation
 * @param delay - Delay in milliseconds before showing animation (default: 0)
 * @param threshold - Intersection threshold (default: 0.3)
 * @returns { ref, isVisible } - Ref to attach to element and visibility state
 */
export const useScrollAnimation = (
  annotationConfig: RoughAnnotationConfig,
  delay: number = 0,
  threshold: number = 0.3
): { ref: RefObject<HTMLSpanElement | null>; isVisible: boolean } => {
  const elementRef = useRef<HTMLSpanElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const annotationRef = useRef<RoughAnnotation | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Create the annotation but don't show it yet
    annotationRef.current = annotate(element, annotationConfig)

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setIsVisible(true)
          setHasAnimated(true)
          
          // Show the annotation with optional delay
          const timer = setTimeout(() => {
            if (annotationRef.current) {
              annotationRef.current.show()
            }
          }, delay)

          return () => clearTimeout(timer)
        }
      },
      {
        threshold,
        rootMargin: '50px', // Start animation slightly before element is fully visible
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
      if (annotationRef.current) {
        annotationRef.current.hide()
      }
    }
  }, [annotationConfig, delay, threshold, hasAnimated])

  return { ref: elementRef, isVisible }
}

interface AnimationConfig {
  ref: RefObject<HTMLSpanElement | null>
  config: RoughAnnotationConfig
  delay?: number
}

/**
 * Hook for multiple scroll-triggered animations with staggered delays
 * @param animations - Array of {ref, config, delay} objects
 * @param threshold - Intersection threshold (default: 0.3)
 */
export const useMultipleScrollAnimations = (
  animations: AnimationConfig[],
  threshold: number = 0.3
): void => {
  const [hasAnimated, setHasAnimated] = useState(false)
  const annotationsRef = useRef<RoughAnnotation[]>([])

  useEffect(() => {
    // Create all annotations but don't show them yet
    annotationsRef.current = animations.map(({ ref, config }) => {
      if (ref.current) {
        return annotate(ref.current, config)
      }
      return null
    }).filter((annotation): annotation is RoughAnnotation => annotation !== null)

    // Use the first element as the trigger for all animations
    const triggerElement = animations[0]?.ref?.current
    if (!triggerElement) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true)
          
          // Trigger all animations with their respective delays
          animations.forEach(({ delay = 0 }, index) => {
            const timer = setTimeout(() => {
              if (annotationsRef.current[index]) {
                annotationsRef.current[index].show()
              }
            }, delay)

            return () => clearTimeout(timer)
          })
        }
      },
      {
        threshold,
        rootMargin: '50px',
      }
    )

    observer.observe(triggerElement)

    return () => {
      observer.disconnect()
      annotationsRef.current.forEach(annotation => {
        if (annotation) {
          annotation.hide()
        }
      })
    }
  }, [animations, threshold, hasAnimated])
}

