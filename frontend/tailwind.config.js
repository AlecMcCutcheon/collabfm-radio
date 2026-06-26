/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./join-required.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        radio: {
          accent: "#87CEFA",
          green: "#90EE90",
          red: "#FF6F6F",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
