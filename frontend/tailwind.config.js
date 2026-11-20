/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#090D16',
        surface: '#0F1623',
        brand: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
        },
        emerald: {
          400: '#34D399',
          500: '#10B981',
          600: '#059669',
        },
        amber: {
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
        },
        rose: {
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        fork: {
          baseline: '#10B981',
          upfront: '#06B6D4',
          emi: '#F59E0B',
          phased: '#8B5CF6',
          trim: '#F43F5E',
        },
        scenario: {
          baseline: '#10B981',
          baselineLight: '#ECFDF5',
          baselineBorder: '#A7F3D0',
          a: '#EF4444',
          aLight: '#FEF2F2',
          aBorder: '#FECACA',
          b: '#8B5CF6',
          bLight: '#F5F3FF',
          bBorder: '#DDD6FE',
          c: '#F59E0B',
          cLight: '#FFFBEB',
          cBorder: '#FDE68A',
        },
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(0,0,0,0.3), 0 1px 3px -1px rgba(0,0,0,0.2)',
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
        node: '0 6px 18px -3px rgba(0, 0, 0, 0.5), 0 2px 6px -2px rgba(0, 0, 0, 0.3)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
        glow: '0 0 20px rgba(16, 185, 129, 0.3)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.3)',
        'glow-rose': '0 0 20px rgba(244, 63, 94, 0.3)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
        'emerald-glow': 'radial-gradient(ellipse at center, rgba(16,185,129,0.15) 0%, transparent 70%)',
        'dark-grid': 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
      },
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '12px',
        lg: '24px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        glow: {
          from: { boxShadow: '0 0 10px rgba(16,185,129,0.2)' },
          to: { boxShadow: '0 0 25px rgba(16,185,129,0.5)' },
        },
        slideUp: {
          from: { transform: 'translateY(10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
