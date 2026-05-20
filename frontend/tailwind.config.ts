import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0D1F30',
          800: '#162C42',
          700: '#1F3A54',
          600: '#274867',
          500: '#305878',
          400: '#4A7295',
          300: '#7FA0BE',
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
