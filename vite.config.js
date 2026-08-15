import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // ethers and recharts dominate the bundle; splitting them keeps the first
    // paint light on hackathon wifi.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('ethers')) return 'web3'
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('react')) return 'react'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    // Proxies /api to the Express backend during development so the frontend
    // can call relative paths in both dev and production.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
      // Yahoo Finance sends no CORS headers, so equity data is bridged through
      // the dev server. In production the Express backend must expose the same
      // path — see the "Real market data" section of the README.
      '/yf': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yf/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VentureDAO/1.0)',
        },
      },
    },
  },
})
