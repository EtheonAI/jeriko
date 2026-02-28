import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const THEME_COLORS = {
  light: {
    navBackground: 'var(--brand-light-bg)',
    textColor: 'var(--brand-dark)',
    buttonBackground: 'var(--brand-dark)',
    buttonText: 'var(--brand-light)',
    buttonBorder: 'var(--brand-dark)'
  },
  dark: {
    navBackground: 'var(--brand-dark)',
    textColor: 'var(--brand-light)',
    buttonBackground: 'var(--brand-accent)',
    buttonText: 'var(--brand-dark)',
    buttonBorder: 'var(--brand-accent)'
  }
};

export const SECTIONS = [
  { id: "hero", isDarkBg: false },
  { id: "introduction", isDarkBg: true },
  { id: "services", isDarkBg: true },
  { id: "portfolio", isDarkBg: true },
  { id: "testimonials", isDarkBg: true },
  { id: "about", isDarkBg: true },
  { id: "contact", isDarkBg: false },
];

const useDynamicTheme = () => {
  const navRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (!mainRef?.current || !navRef?.current) return;

    const nav = navRef.current;
    const navItems = nav.querySelectorAll('.nav-item');
    const navLogo = nav.querySelector('.nav-logo');
    const navButton = nav.querySelector('.nav-button');

    const updateNavTheme = (isDark: boolean) => {
      const duration = 0.3;
      const colors = isDark ? THEME_COLORS.dark : THEME_COLORS.light;
      
      gsap.to(nav, {
        backgroundColor: colors.navBackground,
        duration,
      });

      if (navLogo) {
        gsap.to(navLogo, {
          color: colors.textColor,
          duration,
        });
      }

      navItems.forEach((item) => {
        gsap.to(item, {
          color: colors.textColor,
          duration,
        });
      });

      if (navButton) {
        gsap.to(navButton, {
          backgroundColor: colors.buttonBackground,
          color: colors.buttonText,
          borderColor: colors.buttonBorder,
          duration,
        });
      }
    };

    SECTIONS.forEach(({ id, isDarkBg }) => {
      ScrollTrigger.create({
        trigger: `[data-section="${id}"]`,
        start: 'top 20%',
        end: 'bottom 20%',
        onEnter: () => updateNavTheme(isDarkBg),
        onEnterBack: () => updateNavTheme(isDarkBg),
      });
    });

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  }, { scope: mainRef });

  return { navRef, mainRef };
};

export default useDynamicTheme;

