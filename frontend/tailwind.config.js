/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05070f',
          900: '#0a0e1a',
          850: '#0e1424',
          800: '#131a2e',
          700: '#1b2440',
        },
        brand: {
          50: '#eef2ff',
          200: '#c7d2fe',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
        },
        accent: '#a855f7',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(99,102,241,.25), 0 12px 40px -12px rgba(99,102,241,.45)',
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 40px -24px rgba(0,0,0,.9)',
        lift: '0 1px 0 0 rgba(255,255,255,.06) inset, 0 32px 64px -32px rgba(0,0,0,1), 0 0 0 1px rgba(255,255,255,.04)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,.5)' },
          '70%': { boxShadow: '0 0 0 8px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
        /* Slow-drifting colour fields behind the hero. Two blobs on different
           periods so the loop never lands on an obvious repeat. */
        'drift-a': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%,-4%,0) scale(1.12)' },
          '66%': { transform: 'translate3d(-5%,5%,0) scale(.94)' },
        },
        'drift-b': {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1.05)' },
          '50%': { transform: 'translate3d(-7%,6%,0) scale(.9)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        sweep: {
          '100%': { transform: 'translateX(200%)' },
        },
        'bar-grow': {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .4s cubic-bezier(.21,1.02,.73,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s infinite',
        'drift-a': 'drift-a 26s ease-in-out infinite',
        'drift-b': 'drift-b 34s ease-in-out infinite',
        marquee: 'marquee 42s linear infinite',
        sweep: 'sweep 1.1s ease-out',
      },
    },
  },
  plugins: [],
}
