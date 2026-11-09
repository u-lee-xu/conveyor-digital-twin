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
    // 现场网络不固定：不写死任何 IP / 域名白名单，dev server 允许任意 Host。
    allowedHosts: true,
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
