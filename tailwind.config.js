/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep Space Backgrounds
        bg: {
          900: '#050505',
          800: '#0a0a0a',
          700: '#121212',
        },
        // The Apex Orange
        apex: {
          400: '#ff7b00',
          500: '#ff5e00',
          600: '#cc4b00',
        },
        slate: {
          850: '#1e293b',
        }
      },
      fontFamily: {
        sans: ['Tektur', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        ocr: ['OCR-A', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': "linear-gradient(to right, #1f2937 1px, transparent 1px), linear-gradient(to bottom, #1f2937 1px, transparent 1px)",
      }
    },
  },
  plugins: [],
}
