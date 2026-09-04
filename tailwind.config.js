/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F0',
        surface: '#FFFFFF',
        ink: '#1A1A1A',
        muted: '#6B6560',
        line: '#E6E1D8',
        accent: '#C45C26',
        good: '#1F7A4C',
        bad: '#B42318',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['28px', { lineHeight: '34px', letterSpacing: '-0.01em', fontWeight: '700' }],
        title: ['22px', { lineHeight: '28px', letterSpacing: '-0.005em', fontWeight: '600' }],
        body: ['16px', { lineHeight: '24px' }],
        meta: ['13px', { lineHeight: '18px' }],
        tab: ['11px', { lineHeight: '14px' }],
      },
      maxWidth: {
        phone: '480px',
      },
      boxShadow: {
        paper: '0 1px 2px rgba(26, 26, 26, 0.06), 0 8px 24px rgba(26, 26, 26, 0.08)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
    },
  },
  plugins: [],
}
