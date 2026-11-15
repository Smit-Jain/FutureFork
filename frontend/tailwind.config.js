/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F8FAFC',
        surface: '#FFFFFF',
        brand: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          500: '#F43F5E',
          600: '#E11D48', // Primary brand red
          700: '#BE123C',
          800: '#9F1239',
        },
        scenario: {
          baseline: '#10B981', // Emerald green
          baselineLight: '#ECFDF5',
          baselineBorder: '#A7F3D0',
          a: '#EF4444',        // Red
          aLight: '#FEF2F2',
          aBorder: '#FECACA',
          b: '#8B5CF6',        // Purple
          bLight: '#F5F3FF',
          bBorder: '#DDD6FE',
          c: '#F59E0B',        // Amber / Secondary branch
          cLight: '#FFFBEB',
          cBorder: '#FDE68A',
        },
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(15, 23, 42, 0.05), 0 1px 3px -1px rgba(15, 23, 42, 0.05)',
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        node: '0 6px 18px -3px rgba(0, 0, 0, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
