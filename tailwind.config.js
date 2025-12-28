/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "system-ui", "sans-serif"],
        serif: ["Newsreader", "serif"],
      },
      colors: {
        ink: "#0b0b0f",
        sand: "#f6f4ee",
        clay: "#f0e8db",
        moss: "#1c8d6b",
        amber: "#f3a952",
      },
      boxShadow: {
        soft: "0 20px 60px -30px rgba(15, 23, 42, 0.35)",
        card: "0 20px 40px -24px rgba(15, 23, 42, 0.28)",
      },
    },
  },
  plugins: [],
};
