import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./client/pages/**/*.{ts,tsx}",
    "./client/components/**/*.{ts,tsx}",
    "./client/app/**/*.{ts,tsx}",
    "./client/src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Custom colors for Atlas Robotics - Bold Red Theme
        atlas: {
          "50": "#fef2f2",
          "100": "#fee2e2",
          "200": "#fecaca",
          "300": "#fca5a5",
          "400": "#f87171",
          "500": "#ef4444", // Primary red
          "600": "#dc2626",
          "700": "#b91c1c",
          "800": "#991b1b",
          "900": "#7f1d1d",
          "950": "#450a0a",
        },
        dark: {
          "900": "#121212", // Almost black
          "800": "#1e1e1e",
          "700": "#2d2d2d",
          "600": "#3d3d3d",
        },
        // Bold accent colors
        bold: {
          red: "#ef4444",
          orange: "#f97316",
          yellow: "#eab308",
          purple: "#a855f7",
          pink: "#ec4899",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-right": {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "fade-in-left": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-slow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.7s ease-out forwards",
        "fade-in-right": "fade-in-right 0.7s ease-out forwards",
        "fade-in-left": "fade-in-left 0.7s ease-out forwards",
        "pulse-slow": "pulse-slow 3s infinite",
        float: "float 6s ease-in-out infinite",
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(90deg, hsla(0, 85%, 85%, 1) 0%, hsla(15, 88%, 73%, 1) 100%)",
        "hero-gradient-2":
          "linear-gradient(90deg, hsla(0, 85%, 80%, 1) 0%, hsla(10, 85%, 65%, 1) 100%)",
        "atlas-gradient":
          "linear-gradient(180deg, rgba(239,68,68,0.8) 0%, rgba(239,68,68,0) 100%)",
        // Bold red theme gradients for sections
        "red-gradient-1":
          "linear-gradient(135deg, #ef4444 0%, #dc2626 25%, #b91c1c 50%, #991b1b 75%, #7f1d1d 100%)",
        "red-gradient-2":
          "linear-gradient(135deg, #f97316 0%, #ef4444 25%, #dc2626 50%, #b91c1c 75%, #991b1b 100%)",
        "red-gradient-3":
          "linear-gradient(135deg, #ec4899 0%, #ef4444 25%, #f97316 50%, #eab308 75%, #a855f7 100%)",
        "red-dark-1":
          "linear-gradient(135deg, #7f1d1d 0%, #450a0a 50%, #1c1917 100%)",
        "red-dark-2":
          "linear-gradient(135deg, #991b1b 0%, #7f1d1d 50%, #292524 100%)",
        "red-dark-3":
          "linear-gradient(135deg, #b91c1c 0%, #991b1b 50%, #374151 100%)",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Brockmann", "SF Pro Display", "Inter", "sans-serif"],
        brockmann: ["Brockmann", "serif"],
        playfair: ['"Playfair Display"', "serif"],
      },
      boxShadow: {
        elegant: "0 4px 20px rgba(0, 0, 0, 0.08)",
        "elegant-hover": "0 8px 30px rgba(0, 0, 0, 0.12)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

