const SPONSORS = [
  "coinbase",
  "spotify",
  "pinterest",
  "google",
  "amazon",
  "netflix",
];

export function SponsoredBy() {
  return (
    <section className="py-8 px-8 lg:py-20">
      <div className="container mx-auto text-center">
        <h3 className="mb-8 text-base font-semibold text-gray-900">
          SPONSORED BY
        </h3>
        <div className="overflow-hidden py-4 relative">
          <div className="flex animate-marquee hover:pause">
            {[...SPONSORS, ...SPONSORS].map((logo, key) => (
              <img
                key={key}
                src={`/logos/logo-${logo}.svg`}
                alt={logo}
                className="w-40 mx-8 flex-shrink-0"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SponsoredBy;

