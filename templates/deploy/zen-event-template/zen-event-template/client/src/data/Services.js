import { Search, TestTube, Layers, BarChart3, Briefcase, Zap, Code, Database, Settings, HelpCircle, DollarSign, Lightbulb, Trophy, Users2 } from 'lucide-react'

export const servicesData = [
  {
    id: 'ux-design',
    title: 'UX Design',
    description: 'Transform how users interact with your digital products through strategic UX design. I focus on understanding your users\' needs, behaviors, and pain points to create solutions that are both functional and delightful. Every decision is backed by research and validated through testing.',
    backgroundColor: 'bg-green-300',
    direction: 'normal', // text left, visual right
    mockupType: 'mobile',
    services: [
      { icon: Search, text: "User Research Methods" },
      { icon: TestTube, text: "Usability Testing" },
      { icon: Layers, text: "Interaction Design" },
      { icon: BarChart3, text: "User Flow Optimization" },
      { icon: Briefcase, text: "Information Architecture" }
    ]
  },
  {
    id: 'product-design',
    title: 'Product Design',
    description: 'Bring your vision to life with custom digital products that combine beautiful aesthetics with powerful functionality. From mobile apps to web platforms, I create cohesive design systems that scale with your business and maintain consistency across all touchpoints.',
    backgroundColor: 'bg-gradient-to-br from-purple-400 to-blue-500',
    direction: 'reverse', // visual left, text right
    mockupType: 'dashboard',
    services: [
      { icon: Zap, text: "Interactive design" },
      { icon: Code, text: "Front-end development" },
      { icon: Database, text: "Back-end development" },
      { icon: Settings, text: "CMS Implementation" },
      { icon: HelpCircle, text: "Technical consulting" },
      { icon: Briefcase, text: "Support & maintenance" }
    ]
  },
  {
    id: 'design-consultation',
    title: 'Design Consultation',
    description: 'Get expert guidance to refine your design strategy and overcome creative challenges. Whether you\'re launching a new product, rebranding, or optimizing existing experiences, I provide actionable insights and strategic direction to help you make informed design decisions that drive business growth.',
    backgroundColor: 'bg-cyan-200',
    direction: 'normal', // text left, visual right
    mockupType: 'cards',
    services: [
      { icon: DollarSign, text: "Stakeholder Workshops" },
      { icon: Lightbulb, text: "Design Thinking Workshops" },
      { icon: Trophy, text: "Competitive Analysis" },
      { icon: Users2, text: "Brand Identity Development" }
    ]
  }
]