import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/** 独立 dev 用；实验室运行态只加载 packages/platform/vite.config.ts 的同源代理 */
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
      '@digital-twin/platform': path.resolve(__dirname, '../platform/src'),
    },
  },
  server: { host: '0.0.0.0', port: 5198, allowedHosts: true, proxy: WS_PROXY },
  preview: { host: '0.0.0.0', proxy: WS_PROXY },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
