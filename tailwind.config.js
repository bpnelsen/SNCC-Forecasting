/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        ink: {
          DEFAULT: '#0D1117',
          soft: '#161B22',
          muted: '#21262D',
        },
        steel: {
          DEFAULT: '#8B949E',
          light: '#C9D1D9',
          bright: '#E6EDF3',
        },
        gold: {
          DEFAULT: '#D4A853',
          light: '#F0C87A',
          dark: '#A67C35',
        },
        emerald: { DEFAULT: '#3FB950' },
        crimson: { DEFAULT: '#F85149' },
        azure: { DEFAULT: '#58A6FF' },
      },
    },
  },
  plugins: [],
}
