/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          deep: '#050b14',
          panel: 'rgba(10, 22, 40, 0.5)',
          border: 'rgba(34, 211, 238, 0.10)',
        },
        accent: {
          DEFAULT: '#22d3ee',
          muted: 'rgba(34, 211, 238, 0.3)',
          glow: 'rgba(34, 211, 238, 0.05)',
        },
        text: {
          heading: '#f8fafc',
          body: '#94a3b8',
          muted: '#64748b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
