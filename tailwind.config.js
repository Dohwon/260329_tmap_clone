/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        tmap: {
          blue: '#0064FF',
          blueDark: '#0050CC',
          blueLight: '#E8F0FF',
          orange: '#FF6B00',
          green: '#00C851',
          red: '#FF3B30',
          gray: '#8E8E93',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Noto Sans KR"', 'sans-serif']
      }
    }
  },
  plugins: []
}
