import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/agent': 'http://localhost:8080',
      '/workspace': 'http://localhost:8080',
      '/timeline': 'http://localhost:8080',
      '/post': 'http://localhost:8080',
      '/search': 'http://localhost:8080',
      '/thread': 'http://localhost:8080',
      '/terminal': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/sse': 'http://localhost:8080',
      '/static': 'http://localhost:8080',
    },
  },
  base: '/static/drupalclaw/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
