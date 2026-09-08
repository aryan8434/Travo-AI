import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/chat': 'http://localhost:5000',
      '/api': 'http://localhost:5000',
      '/user': 'http://localhost:5000',
      '/auth': 'http://localhost:5000',
    },
  },
  build: {
    // Express (../index.js) serves this folder as the SPA.
    outDir: '../build',
    emptyOutDir: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\', '/');
          if (/node_modules\/(react|react-dom|scheduler)\//.test(normalized)) return 'react-vendor';
          if (normalized.includes('/node_modules/framer-motion/')) return 'motion';
          if (normalized.includes('/node_modules/lucide-react/')) return 'icons';
        },
      },
    },
  },
})
