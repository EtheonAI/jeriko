import type { TabTheme } from '@/config/tabs';

export const getThemeClasses = (theme: TabTheme) => {
  switch (theme) {
    case 'orange':
      return {
        bg: 'bg-orange-500',
        text: 'text-orange-500',
        accent: 'text-orange-600',
        gradient: 'from-orange-400 to-orange-600',
        shadow: 'shadow-orange-500/50'
      };
    case 'purple':
      return {
        bg: 'bg-purple-600',
        text: 'text-purple-600',
        accent: 'text-purple-700',
        gradient: 'from-purple-500 to-purple-700',
        shadow: 'shadow-purple-500/50'
      };
    case 'blue':
      return {
        bg: 'bg-blue-600',
        text: 'text-blue-600',
        accent: 'text-blue-700',
        gradient: 'from-blue-500 to-blue-700',
        shadow: 'shadow-blue-500/50'
      };
    default:
      return {
        bg: 'bg-orange-500',
        text: 'text-orange-500',
        accent: 'text-orange-600',
        gradient: 'from-orange-400 to-orange-600',
        shadow: 'shadow-orange-500/50'
      };
  }
};

