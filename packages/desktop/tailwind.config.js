/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        surface2: 'var(--color-surface-2)',
        border: 'var(--color-border)',
        ink: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        faint: 'var(--color-text-faint)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-light': 'var(--color-accent-light)',
        'accent-text': 'var(--color-accent-text)',
        work: 'var(--color-work)',
        pause: 'var(--color-pause)',
        brk: 'var(--color-break)'
      },
      gridTemplateColumns: {
        30: 'repeat(30, minmax(0, 1fr))'
      },
      borderRadius: { sm: '6px', md: '10px', lg: '14px', xl: '18px' },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.06)',
        md: '0 4px 12px rgba(0,0,0,0.08)',
        lg: '0 8px 24px rgba(0,0,0,0.12)'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'Segoe UI',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
};
