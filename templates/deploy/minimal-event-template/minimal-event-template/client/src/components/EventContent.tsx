import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EventContentCard from "@/components/EventContentCard";

const DAYS = [
  { value: "Day1", label: "Day 1" },
  { value: "Day2", label: "Day 2" },
  { value: "Day3", label: "Day 3" },
];

const EVENT_CONTENT = [
  {
    title: "AI's Role in Shaping the Future",
    des: "Discover how AI is revolutionizing industries, creating new possibilities, and addressing global challenges. Gain a deep understanding of the pivotal role AI plays in driving innovation, sustainability, and progress in our rapidly evolving world.",
    name: "Marcell Glock",
    position: "Chief Executive, Spotify",
    panel: "Panel Discussion",
    img: "/image/avatar1.webp",
    day: "Day1",
  },
  {
    title: "Introduction to Machine Learning",
    des: "Explore the basic principles, algorithms, and applications of Machine Learning. Through hands-on exercises and practical examples, you'll develop a solid understanding of how Machine Learning powers AI-driven solutions.",
    name: "Sarah Johnson",
    position: "AI Research Director, Google",
    panel: "Workshop",
    img: "/image/avatar2.webp",
    day: "Day1",
  },
  {
    title: "AI in Healthcare: Revolutionizing Patient Care",
    des: "This session is a must-attend for healthcare professionals, AI enthusiasts, and anyone interested in the intersection of technology and well-being. Join us as we discuss how AI is bringing about positive changes in healthcare.",
    name: "Dr. Emily Chen",
    position: "Head of AI Innovation, Netflix",
    panel: "Workshop",
    img: "/image/avatar3.webp",
    day: "Day1",
  },
  {
    title: "Ethics in AI Development",
    des: "Explore the critical ethical considerations in AI development, including bias, fairness, transparency, and accountability. Learn how to build responsible AI systems that benefit society while minimizing potential harm.",
    name: "Dr. Priya Patel",
    position: "Ethics Lead, Coinbase",
    panel: "Panel Discussion",
    img: "/image/avatar2.webp",
    day: "Day2",
  },
  {
    title: "AI-Powered Automation in Business",
    des: "Discover how businesses are leveraging AI to automate processes, increase efficiency, and drive growth. Real-world case studies and practical implementation strategies will be covered.",
    name: "Michael Thompson",
    position: "CTO, Pinterest",
    panel: "Keynote",
    img: "/image/avatar3.webp",
    day: "Day2",
  },
  {
    title: "The Future of AI: Trends and Predictions",
    des: "Join industry leaders as they discuss emerging trends, future possibilities, and the long-term impact of AI on society. Get insights into what the next decade holds for artificial intelligence.",
    name: "Dr. Maria Santos",
    position: "Chief AI Officer, Netflix",
    panel: "Panel Discussion",
    img: "/image/avatar3.webp",
    day: "Day3",
  },
];

export function EventContent() {
  const [activeDay, setActiveDay] = useState("Day1");

  const filteredContent = EVENT_CONTENT.filter(event => event.day === activeDay);

  return (
    <section id="event-content" className="py-8 px-8 lg:py-20">
      <Tabs value={activeDay} onValueChange={setActiveDay} className="mb-8">
        <div className="w-full flex mb-8 flex-col items-center">
          <TabsList className="h-12 w-72 md:w-96">
            {DAYS.map((day) => (
              <TabsTrigger 
                key={day.value}
                value={day.value} 
                className="font-medium"
              >
                {day.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>
      <div className="mx-auto container">
        {filteredContent.map((props, idx) => (
          <EventContentCard key={idx} {...props} />
        ))}
      </div>
    </section>
  );
}

export default EventContent;

