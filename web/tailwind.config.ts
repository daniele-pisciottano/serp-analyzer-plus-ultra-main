import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Work Sans"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#E52217',
          50: '#FEF2F1',
          100: '#FDE0DE',
          200: '#FAC0BC',
          500: '#E52217',
          600: '#C31C13',
          700: '#9B160F',
        },
        ink: {
          DEFAULT: '#14171F',
          muted: '#5B6472',
          faint: '#8A94A6',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          sunken: '#F5F7FA',
          border: '#E3E8EF',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 23, 31, 0.04), 0 4px 16px rgba(20, 23, 31, 0.06)',
      },
    },
  },
  plugins: [],
} satisfies Config
