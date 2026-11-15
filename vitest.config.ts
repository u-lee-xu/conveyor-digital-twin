/**
 * 仅服务根 `src/` 的遗留测试：monorepo 里各设备包的 Vitest 配置在各自的
 * `vite.config.ts` 的 `test` 段（含自己的 setup / environment）。
 * 跑包测试请用 `npm run test -w @digital-twin/<pkg> -- --run`，
 * 不要用本配置去跑 `packages/**`，否则会因为缺少包级 setup 得到假结果。
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
