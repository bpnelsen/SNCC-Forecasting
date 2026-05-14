/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
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
      // Semantic tokens driven by CSS variables in globals.css. Keep both legacy
      // palette names (ink/steel/gold/...) and theme-aware aliases so existing
      // code paths keep compiling while we migrate to the semantic names.
      colors: {
        // Theme-aware semantic colors. Use rgb-triplet form so Tailwind's
        // alpha modifier (e.g. bg-surface/50) keeps working.
        bg:           'rgb(var(--c-bg) / <alpha-value>)',
        surface:      'rgb(var(--c-surface) / <alpha-value>)',
        border:       'rgb(var(--c-border) / <alpha-value>)',
        'border-strong': 'rgb(var(--c-border-strong) / <alpha-value>)',
        fg:           'rgb(var(--c-fg) / <alpha-value>)',
        'fg-strong':  'rgb(var(--c-fg-strong) / <alpha-value>)',
        'fg-dim':     'rgb(var(--c-fg-dim) / <alpha-value>)',
        accent:       'rgb(var(--c-accent) / <alpha-value>)',
        'accent-on':  'rgb(var(--c-accent-on) / <alpha-value>)',
        success:      'rgb(var(--c-success) / <alpha-value>)',
        'success-light':  'rgb(var(--c-success-light) / <alpha-value>)',
        'success-bright': 'rgb(var(--c-success-bright) / <alpha-value>)',
        danger:       'rgb(var(--c-danger) / <alpha-value>)',
        'danger-strong': 'rgb(var(--c-danger-strong) / <alpha-value>)',

        // Legacy palette retained for backwards compat with bits we haven't
        // migrated yet (e.g. chart series colors that stay constant across themes).
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
