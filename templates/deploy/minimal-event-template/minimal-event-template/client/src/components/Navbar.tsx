import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { UserCircle, LayoutGrid, HelpCircle, Menu, X } from "lucide-react";

interface NavItemProps {
  children: React.ReactNode;
  href?: string;
}

function NavItem({ children, href }: NavItemProps) {
  return (
    <li>
      <a
        href={href || "#"}
        className="flex items-center gap-2 font-medium hover:text-gray-600 transition-colors"
      >
        {children}
      </a>
    </li>
  );
}

const NAV_MENU = [
  {
    name: "About",
    icon: UserCircle,
    href: "#about-event",
  },
  {
    name: "Events",
    icon: LayoutGrid,
    href: "#event-content",
  },
  {
    name: "FAQ",
    icon: HelpCircle,
    href: "#faq",
  },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const handleOpen = () => setOpen((cur) => !cur);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 960) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleScroll() {
      setIsScrolling(window.scrollY > 0);
    }
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full border-0 transition-colors ${
        isScrolling ? "bg-white shadow-sm" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div
          className={`text-lg font-bold transition-colors ${
            isScrolling ? "text-gray-900" : "text-white"
          }`}
        >
          AI Conference
        </div>
        <ul
          className={`ml-10 hidden items-center gap-6 lg:flex ${
            isScrolling ? "text-gray-900" : "text-white"
          }`}
        >
          {NAV_MENU.map(({ name, icon: Icon, href }) => (
            <NavItem key={name} href={href}>
              <Icon className="h-5 w-5" />
              <span>{name}</span>
            </NavItem>
          ))}
        </ul>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpen}
          className={`ml-auto inline-block lg:hidden ${
            isScrolling ? "text-gray-900" : "text-white"
          }`}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>
      {open && (
        <div className="container mx-auto mt-4 rounded-lg bg-white px-6 py-5 lg:hidden">
          <ul className="flex flex-col gap-4 text-gray-900">
            {NAV_MENU.map(({ name, icon: Icon, href }) => (
              <NavItem key={name} href={href}>
                <Icon className="h-5 w-5" />
                {name}
              </NavItem>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

export default Navbar;

