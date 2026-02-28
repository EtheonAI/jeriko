import { Button } from "@/components/ui/button";
import { motion, useScroll, useTransform } from "framer-motion";
import { 
  ArrowRight, 
  Users, 
  Lightbulb, 
  Search, 
  Layers, 
  Code, 
  DollarSign, 
  Users2, 
  Trophy, 
  CheckCircle, 
  Linkedin, 
  X, 
  Dribbble, 
  Briefcase 
} from "lucide-react";

export default function Home() {
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);

  return (
    <div className="min-h-screen bg-cream overflow-x-hidden">
      {/* Header */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex justify-between items-center p-4 md:p-6 lg:px-12"
      >
        <motion.div 
          className="flex items-center space-x-2"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <motion.div 
            className="w-8 h-8 bg-orange-500 transform rotate-45 rounded-sm"
            whileHover={{ rotate: 225, scale: 1.1 }}
            transition={{ type: "spring", stiffness: 300 }}
          ></motion.div>
          <span className="text-xl md:text-2xl font-bold text-gray-900">Henry Gold</span>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Button className="bg-purple-600 hover:bg-purple-700 text-white px-4 md:px-6 py-2 text-sm md:text-base rounded-full transition-all duration-300 hover:shadow-lg">
            Book a Call
          </Button>
        </motion.div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative px-4 md:px-6 lg:px-12 py-16 md:py-20 lg:py-32 overflow-hidden">
        <motion.div className="max-w-4xl mx-auto text-center">
          <motion.h1 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold text-gray-900 mb-6 md:mb-8 leading-tight px-2"
          >
            Crafting experiences<br />
            <motion.span 
              className="text-gray-700"
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              that inspire
            </motion.span>
          </motion.h1>
          <motion.p 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 mb-8 md:mb-12 max-w-3xl mx-auto px-4"
          >
            From concept to launch, I transform your vision into exceptional digital experiences 
            that engage users and drive results.
          </motion.p>
          
          {/* Decorative elements */}
          <div className="relative mt-12 md:mt-16">
            <motion.div 
              className="absolute left-1/2 transform -translate-x-1/2 -translate-y-6 md:-translate-y-8"
              style={{ y }}
            >
              <motion.div 
                className="w-24 h-16 md:w-32 md:h-20 bg-yellow-400 rounded-lg transform rotate-3 opacity-80"
                animate={{ 
                  rotate: [3, 6, 3], 
                  scale: [1, 1.05, 1] 
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
              ></motion.div>
              <motion.div 
                className="w-24 h-16 md:w-32 md:h-20 bg-purple-500 rounded-lg transform -rotate-2 opacity-80 -mt-8 md:-mt-12 ml-6 md:ml-8"
                animate={{ 
                  rotate: [-2, -5, -2], 
                  scale: [1, 1.05, 1] 
                }}
                transition={{ 
                  duration: 4, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 0.5 
                }}
              ></motion.div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Personal Introduction */}
      <section className="px-4 md:px-6 lg:px-12 py-12 md:py-16">
        <motion.div 
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.p 
            className="text-lg lg:text-xl text-gray-700 leading-relaxed mb-8"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            With over eight years in digital design, I specialize in creating meaningful connections between 
            brands and their audiences. <span className="font-semibold underline decoration-gray-400">Every pixel serves a purpose</span>, 
            every interaction tells a story, and every design decision is rooted in user research and business objectives.
          </motion.p>
          <motion.p 
            className="text-lg lg:text-xl text-gray-700 leading-relaxed mb-8"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
          >
            I believe great design is invisible – it guides users effortlessly toward their goals while{" "}
            <span className="font-semibold underline decoration-gray-400">delivering exceptional experiences</span>. 
            Through strategic thinking, creative problem-solving, and collaborative partnerships, I help businesses 
            stand out in crowded digital landscapes.
          </motion.p>
          <motion.p 
            className="text-lg lg:text-xl text-gray-700 leading-relaxed"
            initial={{ y: 30, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
          >
            <span className="font-semibold underline decoration-gray-400">Ready to elevate your digital presence?</span>{" "} 
            Let's work together to create experiences that not only look beautiful but drive real results for your business.
          </motion.p>
        </motion.div>
      </section>

      {/* UX Design Service */}
      <section className="px-4 md:px-6 lg:px-12 py-12 md:py-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.h2 
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6"
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                UX Design
              </motion.h2>
              <motion.p 
                className="text-lg text-gray-600 mb-8 leading-relaxed"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                viewport={{ once: true }}
              >
                Transform how users interact with your digital products through strategic UX design. I focus on 
                understanding your users' needs, behaviors, and pain points to create solutions that are both 
                functional and delightful. Every decision is backed by research and validated through testing.
              </motion.p>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-all duration-300 hover:shadow-xl">
                  <span>I need this</span>
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                </Button>
              </motion.div>
            </motion.div>
            <motion.div 
              className="relative"
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.div 
                className="bg-green-300 rounded-3xl p-8 h-96 flex items-center justify-center"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {/* Mobile mockups placeholder */}
                <div className="flex space-x-2 md:space-x-4">
                  <motion.div 
                    className="w-24 md:w-32 h-40 md:h-56 bg-white rounded-2xl shadow-lg flex flex-col"
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -10 }}
                  >
                    <div className="h-4 md:h-6 bg-gray-100 rounded-t-2xl"></div>
                    <div className="flex-1 p-2 md:p-3 space-y-1 md:space-y-2">
                      <div className="h-2 md:h-3 bg-gray-200 rounded"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-8 md:h-12 bg-gray-100 rounded mt-2 md:mt-3"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </motion.div>
                  <motion.div 
                    className="w-24 md:w-32 h-40 md:h-56 bg-white rounded-2xl shadow-lg flex flex-col"
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -10 }}
                  >
                    <div className="h-4 md:h-6 bg-gray-100 rounded-t-2xl"></div>
                    <div className="flex-1 p-2 md:p-3 space-y-1 md:space-y-2">
                      <div className="h-2 md:h-3 bg-gray-200 rounded"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-8 md:h-12 bg-gray-100 rounded mt-2 md:mt-3"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded"></div>
                      <div className="h-2 md:h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
              {/* UX Process steps card */}
              <motion.div 
                className="absolute -bottom-4 md:-bottom-8 -right-4 md:-right-8 bg-gray-900 text-white p-4 md:p-6 rounded-2xl w-64 md:w-80"
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}
              >
                <div className="space-y-4">
                  {[
                    { icon: Users, text: "User Research & Analysis" },
                    { icon: Lightbulb, text: "Ideation & Wireframing" },
                    { icon: Layers, text: "Prototyping & Testing" },
                    { icon: Code, text: "Implementation Support" }
                  ].map(({ icon: IconComponent, text }, index) => (
                    <motion.div 
                      key={text}
                      className="flex items-center space-x-3"
                      initial={{ x: -20, opacity: 0 }}
                      whileInView={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.8 + (index * 0.1) }}
                      viewport={{ once: true }}
                      whileHover={{ x: 5 }}
                    >
                      <IconComponent className="w-5 h-5" />
                      <span>{text}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* UX Research Service */}
      <section className="px-4 md:px-6 lg:px-12 py-12 md:py-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
            <motion.div 
              className="relative order-2 lg:order-1"
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.div 
                className="bg-purple-400 rounded-3xl p-8 h-96 flex items-center justify-center"
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {/* Dashboard mockup */}
                <div className="grid grid-cols-2 gap-2 md:gap-3 w-full max-w-xs">
                  <motion.div 
                    className="w-full h-20 md:h-24 bg-white rounded-lg shadow p-2"
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.5 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -10, scale: 1.05 }}
                  >
                    <div className="h-2 bg-purple-400 rounded mb-1 md:mb-2"></div>
                    <div className="h-2 bg-gray-600 rounded w-3/4"></div>
                  </motion.div>
                  <motion.div 
                    className="w-full h-20 md:h-24 bg-white rounded-lg shadow p-2"
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.6 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -10, scale: 1.05 }}
                  >
                    <div className="h-2 bg-cyan-400 rounded mb-1 md:mb-2"></div>
                    <div className="h-2 bg-gray-600 rounded w-3/4"></div>
                  </motion.div>
                  <motion.div 
                    className="w-full h-20 md:h-24 bg-white rounded-lg shadow p-2 col-span-2"
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.7 }}
                    viewport={{ once: true }}
                    whileHover={{ y: -5, scale: 1.03 }}
                  >
                    <div className="h-2 bg-gray-300 rounded mb-1"></div>
                    <div className="h-2 bg-gray-300 rounded mb-1"></div>
                    <div className="h-2 bg-gray-300 rounded w-1/2"></div>
                  </motion.div>
                </div>
              </motion.div>
              {/* Service card */}
              <motion.div 
                className="absolute -bottom-4 md:-bottom-8 -left-4 md:-left-8 bg-gray-900 text-white p-4 md:p-6 rounded-2xl w-64 md:w-80"
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05, boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}
              >
                <div className="space-y-4">
                  {[
                    { icon: DollarSign, text: "Stakeholder Workshops" },
                    { icon: Lightbulb, text: "Design Thinking Workshops" },
                    { icon: Trophy, text: "Competitive Analysis" },
                    { icon: Users2, text: "Brand Identity Development" }
                  ].map(({ icon: IconComponent, text }, index) => (
                    <motion.div 
                      key={text}
                      className="flex items-center space-x-3"
                      initial={{ x: -20, opacity: 0 }}
                      whileInView={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.4, delay: 0.8 + (index * 0.1) }}
                      viewport={{ once: true }}
                      whileHover={{ x: 5 }}
                    >
                      <IconComponent className="w-5 h-5" />
                      <span>{text}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
            <motion.div
              className="order-1 lg:order-2"
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true, margin: "-100px" }}
            >
              <motion.h2 
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-6"
                initial={{ y: 30, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                UX Research
              </motion.h2>
              <motion.p 
                className="text-lg text-gray-600 mb-8 leading-relaxed"
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                viewport={{ once: true }}
              >
                Uncover deep insights about your users through comprehensive research methodologies. From user 
                interviews to usability testing, I employ data-driven approaches to inform design decisions and 
                validate assumptions, ensuring your product truly resonates with your target audience.
              </motion.p>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-full flex items-center space-x-2 transition-all duration-300 hover:shadow-xl">
                  <span>I need this</span>
                  <motion.div
                    animate={{ x: [0, 5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </motion.div>
                </Button>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Experience Section */}
      <section className="px-4 md:px-6 lg:px-12 py-12 md:py-16">
        <div className="bg-orange-500 rounded-3xl p-6 md:p-12 lg:p-20 text-white">
          <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16 px-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold mb-6 md:mb-8">
              Proven expertise<br />
              across diverse industries
            </h2>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl opacity-90">
              My multidisciplinary approach combines strategic thinking with creative execution, 
              delivering comprehensive solutions that address both user needs and business objectives.
            </p>
          </div>

          {/* Portfolio Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-6xl mx-auto">
            {[
              { title: "E-commerce Platform Redesign", bg: "bg-gray-900", delay: 0.2 },
              { title: "SaaS Dashboard Interface", bg: "bg-gradient-to-br from-blue-400 to-blue-600", delay: 0.3 },
              { title: "Healthcare Mobile App", bg: "bg-gradient-to-br from-yellow-400 to-orange-400", delay: 0.4 },
              { title: "Brand Identity System", bg: "bg-gradient-to-br from-purple-400 to-pink-400", delay: 0.5, hasDecorations: true }
            ].map(({ title, bg, delay, hasDecorations }) => (
              <motion.div 
                key={title}
                className={`${bg} rounded-2xl p-6 md:p-8 h-40 md:h-48 flex items-end relative overflow-hidden cursor-pointer`}
                initial={{ y: 50, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true, margin: "-50px" }}
                whileHover={{ 
                  scale: 1.05, 
                  boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.3)" 
                }}
                animate={{
                  y: [0, -5, 0]
                }}
                transition={{
                  y: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: delay * 0.8 },
                  opacity: { duration: 0.4, delay: delay * 0.3 },
                  scale: { duration: 0.4, delay: delay * 0.3 }
                }}
              >
                {hasDecorations && (
                  <>
                    <motion.div 
                      className="absolute top-4 right-4 w-16 h-16 bg-white bg-opacity-20 rounded-full"
                      animate={{ scale: [1, 1.1, 1], rotate: [0, 10, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                    ></motion.div>
                    <motion.div 
                      className="absolute top-8 right-8 w-12 h-12 bg-white bg-opacity-30 rounded-full"
                      animate={{ scale: [1, 1.2, 1], rotate: [0, -15, 0] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                    ></motion.div>
                  </>
                )}
                <motion.h3 
                  className="text-2xl font-bold text-white"
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: delay * 0.3 + 0.1 }}
                  viewport={{ once: true }}
                >
                  {title}
                </motion.h3>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final Section */}
      <section className="px-4 md:px-6 lg:px-12 py-16 md:py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12 md:mb-16 px-4">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-gray-900 mb-4">
              Design Partner<br />
              For <span className="text-orange-500">Digital Solutions</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-16 items-start">
            <div className="space-y-6 md:space-y-8">
              <p className="text-lg text-gray-600 leading-relaxed">
                With over 8 years of expertise in digital design, I bring a strategic approach to every project. 
                I collaborate closely with teams to ensure that solutions are not only visually compelling but also 
                drive measurable business results through user-centered design principles.
              </p>
              
              <div className="bg-orange-100 rounded-2xl p-8 text-center">
                <div className="text-4xl font-bold text-orange-500 mb-2">40%</div>
                <div className="text-gray-600">Average conversion increase</div>
              </div>

              <p className="text-lg text-gray-600 leading-relaxed">
                As a strategic design partner, I help organizations navigate complex design challenges and unlock 
                growth opportunities. Through data-driven insights, user research, and iterative design processes, 
                I deliver solutions that create lasting impact for both users and businesses.
              </p>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700">Recognized Leaders in User Experience</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700">8+ Years of Experience</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700">Clients in 15+ Countries</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700">Certified UX Professionals</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="w-5 h-5 text-blue-500" />
                  <span className="text-gray-700">Published UX Authors & Columnists</span>
                </div>
              </div>

              <p className="text-lg text-gray-600 leading-relaxed">
                Recent projects include developing a comprehensive design system for a fintech startup and redesigning 
                a healthcare platform that improved user engagement by 60%. I specialize in creating scalable solutions 
                that maintain consistency while adapting to evolving business needs.
              </p>
            </div>

            <div className="space-y-8">
              {/* Service Icons */}
              <div className="grid grid-cols-2 gap-4 md:gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                    <Search className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <span className="text-sm md:text-base text-gray-700 font-medium">UX Research</span>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                    <Layers className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <span className="text-sm md:text-base text-gray-700 font-medium">UX Design</span>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                    <Users className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <span className="text-sm md:text-base text-gray-700 font-medium">User Interviews</span>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-2 md:mb-3">
                    <Code className="w-6 h-6 md:w-8 md:h-8 text-white" />
                  </div>
                  <span className="text-sm md:text-base text-gray-700 font-medium">Web Design</span>
                </div>
              </div>

              {/* Client Logos */}
              <div className="space-y-4 md:space-y-6">
                <h3 className="text-lg md:text-xl font-semibold text-gray-900 text-center">Trusted by leading companies</h3>
                <div className="grid grid-cols-1 gap-3 md:gap-4">
                  <div className="text-center py-3 md:py-4 px-4 md:px-6 bg-gray-100 rounded-lg">
                    <span className="text-base md:text-lg font-semibold text-gray-600">TechFlow</span>
                  </div>
                  <div className="text-center py-3 md:py-4 px-4 md:px-6 bg-gray-100 rounded-lg">
                    <span className="text-base md:text-lg font-semibold text-gray-600">DataVault</span>
                  </div>
                  <div className="text-center py-3 md:py-4 px-4 md:px-6 bg-gray-100 rounded-lg">
                    <span className="text-base md:text-lg font-semibold text-gray-600">CloudSync</span>
                  </div>
                  <div className="text-center py-3 md:py-4 px-4 md:px-6 bg-gray-100 rounded-lg">
                    <span className="text-base md:text-lg font-semibold text-gray-600">InnovateCorp</span>
                  </div>
                  <div className="text-center py-3 md:py-4 px-4 md:px-6 bg-gray-100 rounded-lg">
                    <span className="text-base md:text-lg font-semibold text-gray-600">NextGen</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-4 md:px-6 lg:px-12 py-16 md:py-20">
        <motion.div 
          className="max-w-4xl mx-auto"
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.div 
            className="bg-blue-900 rounded-3xl px-6 md:px-12 py-12 md:py-16 text-white relative overflow-hidden"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {/* Animated background elements */}
            <motion.div
              className="absolute -top-20 -right-20 w-40 h-40 bg-blue-700 rounded-full opacity-20"
              animate={{ 
                rotate: [0, 360],
                scale: [1, 1.1, 1]
              }}
              transition={{ 
                duration: 20,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            <motion.div
              className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-800 rounded-full opacity-30"
              animate={{ 
                rotate: [360, 0],
                scale: [1, 1.2, 1]
              }}
              transition={{ 
                duration: 15,
                repeat: Infinity,
                ease: "linear"
              }}
            />
            
            <motion.div 
              className="text-center mb-12 relative z-10"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <motion.h2 
                className="text-2xl sm:text-3xl lg:text-5xl font-bold mb-6 md:mb-8"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                viewport={{ once: true }}
              >
                Ready to transform<br />
                your digital experience?
              </motion.h2>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button className="bg-gray-900 hover:bg-gray-800 text-white px-6 md:px-8 py-3 rounded-full mb-4 transition-all duration-300 hover:shadow-2xl">
                  Let's Work Together
                </Button>
              </motion.div>
              <motion.p 
                className="text-blue-200"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5 }}
                viewport={{ once: true }}
              >
                Schedule a free consultation call
              </motion.p>
            </motion.div>

            {/* Social Links */}
            <motion.div 
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 relative z-10"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              viewport={{ once: true }}
            >
              {[
                { icon: Linkedin, bg: "bg-purple-500", delay: 0.1 },
                { icon: X, bg: "bg-cyan-400", delay: 0.2 },
                { icon: Dribbble, bg: "bg-pink-500", delay: 0.3 },
                { icon: Briefcase, bg: "bg-purple-600", delay: 0.4 }
              ].map(({ icon: IconComponent, bg, delay }) => (
                <motion.div 
                  key={IconComponent.name}
                  className={`${bg} text-white p-3 md:p-4 rounded-lg flex items-center justify-center cursor-pointer`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.7 + delay }}
                  viewport={{ once: true }}
                  whileHover={{ 
                    scale: 1.05, 
                    y: -5,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <IconComponent className="w-4 h-4 md:w-5 md:h-5" />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}

