import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

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
  resolve: {
    alias: {
      '@digital-twin/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        viewer: path.resolve(__dirname, 'viewer.html'),
      },
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
