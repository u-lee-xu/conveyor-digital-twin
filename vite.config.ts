import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['net'],
            },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: [
      'frp-tip.com',
      '.natfrp.com',
      '.frp-tip.com',
      '.nyat.app',
      'localhost',
      '10.40.32.59',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
          'vendor-rapier': ['@react-three/rapier'],
          'vendor-r3f': ['@react-three/fiber', '@react-three/drei'],
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
})
