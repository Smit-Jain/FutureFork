/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Schibsted Grotesk Variable"', '"Schibsted Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        paper: {
          DEFAULT: '#efece6',
          2: '#f6f4ef',
          3: '#e6e2da',
        },
        ink: {
          DEFAULT: '#141414',
          2: '#3a3936',
          dim: 'rgba(20,20,20,.5)',
          faint: 'rgba(20,20,20,.14)',
          line: 'rgba(20,20,20,.09)',
        },
        brand: {
          amber: '#ffb347',
          orange: '#ff8a3d',
          coral: '#ff5a5f',
          pink: '#ff3d8b',
        },
        // Fork accents, tuned for contrast on paper
        fork: {
          baseline: '#2f7d4f',
          upfront: '#0f6b8f',
          emi: '#c76a12',
          phased: '#6d4bd1',
          trim: '#d6345f',
          absorb: '#0f6b8f',
          delay: '#c76a12',
          phase_in: '#6d4bd1',
        },
        good: '#2f7d4f',
        warn: '#c76a12',
        bad: '#d6345f',
      },
      backgroundImage: {
        'brand-conic':
          'conic-gradient(from 200deg, #ffb347, #ff8a3d 18%, #ff5a5f 34%, #ff3d8b 50%, #ff5a5f 66%, #ff8a3d 82%, #ffb347)',
        'brand-linear': 'linear-gradient(90deg, #ff8a3d, #ff5a5f 50%, #ff3d8b)',
        'brand-linear-amber': 'linear-gradient(90deg, #ffb347, #ff8a3d 40%, #ff3d8b)',
      },
      boxShadow: {
        paper: '0 1px 0 rgba(20,20,20,.06), 0 10px 30px -18px rgba(20,20,20,.35)',
        lift: '0 2px 0 rgba(20,20,20,.05), 0 24px 48px -24px rgba(20,20,20,.45)',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(.2,.7,.2,1)',
        slide: 'cubic-bezier(.65,0,.2,1)',
      },
      animation: {
        'fade-in': 'fadeIn .45s cubic-bezier(.2,.7,.2,1) both',
        'slide-up': 'slideUp .45s cubic-bezier(.2,.7,.2,1) both',
        caret: 'caret 1s steps(1) infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        caret: {
          '0%, 49%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
};
