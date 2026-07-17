/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        mimoorange: {
          DEFAULT: "#FF6700",
          50: "#FFF3E9",
          100: "#FFE0C7",
          200: "#FFC199",
          300: "#FFA366",
          400: "#FF8A3D",
          500: "#FF6700",
          600: "#E65C00",
          700: "#B84700",
          800: "#8A3600",
          900: "#5C2400",
        },
        ink: {
          950: "#0B0D12",
          900: "#101319",
          850: "#151922",
          800: "#1A1F2B",
          750: "#20262F",
          700: "#2A313C",
          600: "#3A424F",
          500: "#4B5563",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "Menlo", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,103,0,0.3), 0 4px 20px -4px rgba(255,103,0,0.25)",
        soft: "0 2px 12px -2px rgba(0,0,0,0.08)",
        panel: "0 8px 40px -8px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.3s ease-out",
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
