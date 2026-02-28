import company1 from '@/assets/company-1.webp';
import company2 from '@/assets/company-2.webp';
import airbnbLogo from '@/assets/airbnb.webp';
import nusLogo from '@/assets/nus.webp';

// Typing for experience items
export interface ExperienceItem {
  title: string;
  companyName: string;
  icon: string;
  iconBg: string;
  date: string;
  points: string[];
}

// Experience timeline data
export const experiences: ExperienceItem[] = [
  {
    title: 'Senior Product Designer',
    companyName: 'CreativeTech Inc.',
    icon: company1,
    iconBg: '',
    date: '2024 – Present',
    points: [
      'Leading end-to-end product design for SaaS platform serving 50k+ users.',
      'Driving user-research initiatives and data-informed design decisions.',
      'Mentoring junior designers and shaping design strategy company-wide.',
    ],
  },
  {
    title: 'Lead UX Designer',
    companyName: 'Innovate Studio',
    icon: company2,
    iconBg: '',
    date: '2022 – 2024',
    points: [
      'Oversaw multi-disciplinary team delivering web & mobile experiences.',
      'Redesigned core product resulting in 30% increase in engagement.',
      'Established scalable design system adopted across 3 product lines.',
    ],
  },
  {
    title: 'Product Design Intern',
    companyName: 'Airbnb',
    icon: airbnbLogo,
    iconBg: '',
    date: 'Summer 2021',
    points: [
      'Collaborated on Host onboarding flow improvements.',
      'Built interactive prototypes for A/B testing with 200+ participants.',
      'Presented findings to cross-functional leadership.',
    ],
  },
  {
    title: 'B.A. (Hons) in Design',
    companyName: 'National University of Singapore',
    icon: nusLogo,
    iconBg: '',
    date: '2017 – 2021',
    points: [
      'Graduated with First-Class Honours, specialising in interaction design.',
      'President of Design Society organising annual design hackathon.',
      'Capstone project shortlisted for international design award.',
    ],
  }
];

