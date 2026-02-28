import { motion } from 'framer-motion'

const Location = () => {
  return (
    <section className="py-20 bg-white" id="location">
      <div className="container mx-auto px-6">
        <motion.div
          className="text-left mb-4"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <p className="text-charcoal/60 text-sm uppercase tracking-wide mb-2">Location</p>
          <h2 className="text-4xl md:text-5xl font-serif text-charcoal mb-12">
            We'll see you at Ulvhälls Herrgård
          </h2>
        </motion.div>

        {/* Venue Image */}
        <motion.div
          className="mb-16"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <img
            src="https://images.unsplash.com/photo-1519167758481-83f550bb49b3?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2098&q=80"
            alt="Ulvhälls Herrgård"
            className="w-full h-96 md:h-[500px] object-cover shadow-lg"
          />
        </motion.div>

        {/* Three Information Blocks */}
        <div className="grid md:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-serif text-charcoal mb-4">The venue</h3>
            <p className="text-charcoal/70 leading-relaxed">
              Ulvhälls Herrgård is a historic manor house just outside Strängnäs.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-serif text-charcoal mb-4">By car</h3>
            <p className="text-charcoal/70 leading-relaxed">
              There's <strong>free parking on-site</strong> at Ulvhäll. Just follow the signs when you arrive.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
          >
            <h3 className="text-xl font-serif text-charcoal mb-4">By train</h3>
            <p className="text-charcoal/70 leading-relaxed">
              We recommend taking the train to <strong>Strängnäs station</strong>. From there, it's 7 minutes by taxi.
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export default Location

