import { Button } from "@/components/ui/button";

const CURRENT_YEAR = new Date().getFullYear();
const LINKS = ["About", "Schedule", "Speakers", "Contact"];

export function Footer() {
  return (
    <footer className="pb-5 p-10 md:pt-10">
      <div className="container flex flex-col mx-auto">
        <div className="flex !w-full py-10 mb-5 md:mb-20 flex-col justify-center !items-center bg-gray-900 max-w-6xl mx-auto rounded-2xl p-5">
          <h2 className="text-2xl md:text-3xl text-center font-bold text-white">
            Don't Miss Out!
          </h2>
          <p className="text-white md:w-7/12 text-center my-3 text-base">
            Register now for the AI Innovation Summit and secure your spot.
          </p>
          <div className="flex w-full md:w-fit gap-3 mt-2 flex-col md:flex-row">
            <Button variant="secondary" size="lg">
              Register Now
            </Button>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center !justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            AI Innovation Summit
          </h3>
          <ul className="flex justify-center my-4 md:my-0 w-max mx-auto items-center gap-4">
            {LINKS.map((link, index) => (
              <li key={index}>
                <a
                  href="#"
                  className="text-sm font-normal text-gray-700 hover:text-gray-900 transition-colors"
                >
                  {link}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex w-fit justify-center gap-2">
            <Button size="sm" variant="ghost" className="text-gray-700">
              <span className="text-lg font-bold">𝕏</span>
            </Button>
            <Button size="sm" variant="ghost" className="text-gray-700">
              <i className="fa-brands fa-youtube text-lg" />
            </Button>
            <Button size="sm" variant="ghost" className="text-gray-700">
              <i className="fa-brands fa-instagram text-lg" />
            </Button>
            <Button size="sm" variant="ghost" className="text-gray-700">
              <i className="fa-brands fa-linkedin text-lg" />
            </Button>
          </div>
        </div>
        <p className="text-center mt-12 font-normal text-gray-700">
          &copy; {CURRENT_YEAR} AI Innovation Summit. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;

