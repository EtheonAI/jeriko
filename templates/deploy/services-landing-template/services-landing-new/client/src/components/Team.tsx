import { motion } from "framer-motion";
import teamMemberOne from "@/assets/images/team/team-member-one.webp";
import teamMemberTwo from "@/assets/images/team/team-member-two.webp";

export function Team() {
  const teamMembers = [
    { name: "Sarah Johnson", image: teamMemberOne },
    { name: "Michael Chen", image: teamMemberTwo },
  ];

  return (
    <section className="bg-gray-50 py-20">
      <div className="container mx-auto px-6">
        <div className="text-left grid grid-cols-1 lg:grid-cols-3 gap-8">
          <h2 className="text-4xl font-bold text-gray-900 mb-8">
            Meet our professional team
          </h2>
          {teamMembers.map((member, index) => (
            <motion.div
              key={index}
              className="text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="relative mb-4">
                <img
                  src={member.image}
                  alt={member.name}
                  className="w-full h-[500px] lg:h-[800px] object-cover rounded-lg"
                />
                <div className="absolute bottom-4 left-4">
                  <span className="bg-white px-3 py-1 rounded-full text-sm font-medium text-gray-900">
                    {member.name}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

