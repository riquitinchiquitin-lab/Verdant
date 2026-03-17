/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./context/**/*.{js,ts,jsx,tsx}",
    "./data/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        serif: ['Inter', 'serif'],
        mono: ['Inter', 'monospace']
      },
      colors: {
        verdant: {
          DEFAULT: '#5E8F47',
          hover: '#4d753a',
          light: '#7AA765',
          dark: '#3d5d2e',
          sage: '#A3B18A',
          bone: '#F5F7F2'
        }
      }
    },
  },
  plugins: [],
}
