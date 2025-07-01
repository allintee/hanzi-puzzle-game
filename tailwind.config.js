/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html", 
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'pop-in': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'bounce-subtle': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'pulse-fade': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.02)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
        },
        'check-fade-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'confetti-fall': {
          '0%': {
            transform: 'translateY(-100vh) rotateZ(0deg)',
            opacity: '0',
          },
          '10%': {
            opacity: '1', 
          },
          '100%': {
            transform: 'translateY(100vh) rotateZ(720deg)', 
            opacity: '0',
          },
        }
      },
      animation: {
        'pop-in': 'pop-in 0.5s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'bounce-subtle': 'bounce-subtle 2s infinite ease-in-out',
        'pulse-fade': 'pulse-fade 2s infinite ease-in-out',
        'shake': 'shake 0.5s ease-in-out',
        'check-fade-in': 'check-fade-in 0.3s ease-out forwards',
        'confetti-fall': 'confetti-fall 3s ease-out forwards',
      }
    },
  },
  plugins: [], 
}
