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
          panel: 'rgba(8, 18, 36, 0.65)',
          border: 'rgba(34, 211, 238, 0.12)',
        },
        accent: {
          DEFAULT: '#22d3ee',
          muted: 'rgba(34, 211, 238, 0.3)',
          glow: 'rgba(34, 211, 238, 0.06)',
          bright: '#67e8f9',
        },
        text: {
          heading: '#f0f9ff',
          body: '#94a3b8',
          muted: '#64748b',
        },
        warn: {
          DEFAULT: '#fbbf24',
          glow: 'rgba(251,191,36,0.08)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 8px rgba(34,211,238,0.3), 0 0 20px rgba(34,211,238,0.1)',
        'glow-md': '0 0 16px rgba(34,211,238,0.4), 0 0 40px rgba(34,211,238,0.15)',
        'glow-lg': '0 0 30px rgba(34,211,238,0.5), 0 0 80px rgba(34,211,238,0.2)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        }
      }
    },
  },
  plugins: [],
}
