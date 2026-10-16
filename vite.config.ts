import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    host: true,
    proxy: {
      '/twedot-api': {
        target: 'https://prodapi.twedot.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/twedot-api/, ''),
        secure: true,
      },
      '/stream-api': {
        target: 'http://localhost:8084',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stream-api/, ''),
        ws: true,
      },
    },
  },
})
