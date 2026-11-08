import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
  plugins: [react()],
  resolve: {
    alias: {
      '@digital-twin/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    // platform 包占用 5174，避免端口冲突
    port: 5176,
    strictPort: true,
    proxy: WS_PROXY,
  },
  preview: { host: '0.0.0.0', proxy: WS_PROXY },
})
