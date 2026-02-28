export const tabs = [
  { id: 'about', label: 'ABOUT', number: '01', theme: 'orange' },
  { id: 'agenda', label: 'SCHEDULE', number: '02', theme: 'purple' },
  { id: 'tickets', label: 'TICKETS', number: '03', theme: 'blue' }
] as const;

export type TabTheme = 'orange' | 'purple' | 'blue';
export type TabId = 'about' | 'agenda' | 'tickets';

