import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0D1B2A',
          800: '#0A1525',
          700: '#0E1E30',
          600: '#122236',
          500: '#1A2D44',
          400: '#2A4060',
          300: '#5A7A9A',
        },
        drupal: {
          blue: '#0678BE',
          'blue-light': '#90CAF9',
          'blue-dark': '#044F7F',
        },
        ai: {
          teal: '#00B4D8',
          'teal-light': '#48CAE4',
          'teal-dark': '#0096B7',
        },
        accent: {
          orange: '#F77F00',
          green: '#06D6A0',
          red: '#EF476F',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
