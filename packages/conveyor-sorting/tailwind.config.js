/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'dark': {
          950: '#020617',
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        'accent': {
          primary: '#3b82f6',
          primary: {
            400: '#60a5fa',
            500: '#3b82f6',
            600: '#2563eb',
          },
          success: '#22c55e',
          success: {
            400: '#4ade80',
            500: '#22c55e',
            600: '#16a34a',
          },
          warning: '#f59e0b',
          warning: {
            400: '#fbbf24',
            500: '#f59e0b',
            600: '#d97706',
          },
          danger: '#ef4444',
          danger: {
            400: '#f87171',
            500: '#ef4444',
            600: '#dc2626',
          },
        },
        'neon': {
          blue: '#00d4ff',
          purple: '#a855f7',
          pink: '#ec4899',
          cyan: '#22d3ee',
          green: '#10b981',
        },
        'gradient': {
          'blue-purple': 'linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)',
          'purple-pink': 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
          'cyan-blue': 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)',
          'green-cyan': 'linear-gradient(135deg, #10b981 0%, #22d3ee 100%)',
        },
        'surface': {
          panel: 'rgba(15, 23, 42, 0.85)',
          panelLight: 'rgba(30, 41, 59, 0.9)',
          elevated: 'rgba(51, 65, 85, 0.5)',
        },
        'text': {
          primary: '#ffffff',
          secondary: '#e2e8f0',
          tertiary: '#cbd5e1',
          muted: '#94a3b8',
        }
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'neon-blue': '0 0 10px rgba(0, 212, 255, 0.5), 0 0 20px rgba(0, 212, 255, 0.3)',
        'neon-purple': '0 0 10px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.3)',
        'neon-pink': '0 0 10px rgba(236, 72, 153, 0.5), 0 0 20px rgba(236, 72, 153, 0.3)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'elevated': '0 12px 40px rgba(0, 0, 0, 0.4)',
      },
      backdropBlur: {
        'glass': '20px',
      },
    },
  },
  plugins: [],
}
