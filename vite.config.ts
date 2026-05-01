import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
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
})
