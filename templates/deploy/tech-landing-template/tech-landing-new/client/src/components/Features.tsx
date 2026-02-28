import { motion } from 'framer-motion';
import { FileText, Globe, MessageCircle, BarChart3, Users, CheckCircle } from 'lucide-react';

function Features() {
  const features = [
    {
      icon: BarChart3,
      title: "Analytics at a Glance",
      description: "Get instant insights into revenue, expenses, and client growth. Interactive charts give you real-time clarity on performance trends."
    },
    {
      icon: Users,
      title: "Client Management Made Easy",
      description: "Keep all client info in one place. Manage contacts, track interactions, and never miss an opportunity."
    },
    {
      icon: CheckCircle,
      title: "Smart Task Scheduling",
      description: "Stay ahead with task reminders and deadlines. Assign, track, and complete tasks seamlessly."
    },
    {
      icon: MessageCircle,
      title: "Real-Time Notifications",
      description: "Get alerts for deal updates, new clients, and task changes. Stay informed without constantly checking your dashboard."
    },
    {
      icon: Globe,
      title: "Deal Pipeline Tracking",
      description: "Visualize every stage of your deals. Monitor progress and forecast revenue with confidence."
    },
    {
      icon: FileText,
      title: "Quick Export & Sharing",
      description: "Share reports and export data in seconds. Collaborate effortlessly with team members and stakeholders."
    }
  ];

  return (
    <section id="features" className="py-20 px-6 bg-[var(--bg-dark)]">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h3 className="text-sm font-semibold text-[var(--primary-color)] tracking-wider uppercase mb-4">
            FEATURES
          </h3>
          <h2 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-6">
            Why Choose our Platform?
          </h2>
        </motion.div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                whileHover={{ y: -5 }}
                className="bg-[var(--bg-card)] border border-[var(--bg-muted)] rounded-lg p-8 hover:border-[var(--border-primary)] transition-all duration-300 group"
              >
                <div className="mb-6">
                  <div className="w-12 h-12 bg-[var(--primary-color)]/10 rounded-lg flex items-center justify-center group-hover:bg-[var(--primary-color)]/20 transition-colors duration-300">
                    <IconComponent className="w-12 h-12 text-[var(--primary-color)]" />
                  </div>
                </div>
                
                <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-4 group-hover:text-[var(--primary-color)] transition-colors duration-300">
                  {feature.title}
                </h3>
                
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Features;

