/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        panel: "#151C2C",
        mint: "#5EEAD4",
      },
    },
  },
  plugins: [],
};
