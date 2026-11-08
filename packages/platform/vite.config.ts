import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

/** 浏览器只碰一个端口：WebSocket 同源代理到本机内部服务，CSP 'self' 直接放行 */
const WS_PROXY = {
  '/ws/plc': {
    target: 'ws://127.0.0.1:8081',
    ws: true,
    rewrite: (p: string) => p.replace(/^\/ws\/plc/, '') || '/',
  },
  '/ws/relay': {
    target: 'ws://127.0.0.1:8082',
    ws: true,
    rewrite: (p: string) => p.replace(/^\/ws\/relay/, '') || '/',
  },
};

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
  resolve: {
    alias: {
      '@digital-twin/shared': path.resolve(__dirname, '../shared/src'),
      '@digital-twin/conveyor-sorting': path.resolve(__dirname, '../conveyor-sorting/src'),
      '@digital-twin/pneumatic-robot': path.resolve(__dirname, '../pneumatic-robot/src'),
      '@digital-twin/traffic-light': path.resolve(__dirname, '../traffic-light/src'),
      '@digital-twin/auto-dispensing': path.resolve(__dirname, '../auto-dispensing/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: ['siit.duckdns.org'],
    proxy: WS_PROXY,
  },
  preview: { host: '0.0.0.0', proxy: WS_PROXY },
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
