# Repository Guidelines

## Project Structure & Module Organization
The real entry is the npm workspace `packages/*`: `packages/platform` is the shell (device registry, Vite config, Electron main, viewer relay client), and each teaching scene is its own package (`conveyor-sorting`, `auto-dispensing`, `pneumatic-robot`, `traffic-light`, `md520-vfd`, `inovance-gantry`, `liquid-mixing`). `packages/shared` holds shared services/types; `websocket-server/` is the standalone Node gateway, relay and mock-PLC bridge. The root `src/` is legacy code and is **not** the app entry. Build outputs (`packages/platform/dist`, per-package `dist/`, `dist-electron/`, `release/`) are generated artifacts and should not be edited by hand.

Adding a device requires wiring `packages/platform/src/registry.ts`, the platform `package.json`, `vite.config.ts` aliases, `tsconfig.app.json` paths/include, CSS `@source`, `auto-dispensing/__demo_command_check.test.ts`'s `pkgOf` map, plus the new package's own `tsconfig.json`, `tsconfig.node.json` and `vite.config.ts` (with a `test` section).

## Build, Test, and Development Commands
Run `npm install` at the root, then `npm install` inside `websocket-server/` on first setup.

- `npm run start:lab`: **the** teaching-lab entry. It starts Vite `preview` on `:5201`, the PLC gateway `:8081` and relay `:8082`. No built-in mock PLC is started in teaching delivery. Preview reads `packages/platform/dist`, so rebuild after source changes.
- `npm run start:devlab`: same lab plus built-in mock PLC targets (`:1503 / :1505 / :1507 / :1508`) for development and frame-level acceptance scripts only; equivalent to `DT_ENABLE_MOCK=1 npm run start:lab`.
- `npm run build:platform`: type-check and build the shipped shell bundle. Device packages without their own `index.html` only run `tsc -b` for type checking.
- `npm run dev:platform` / `npm run dev:<device>`: single-package Vite dev server (debug only; the lab always uses the platform shell).
- `npm run websocket:start`: start only the standalone gateway.
- `npm run lint`: ESLint over `packages/`.
- `npm run test -w @digital-twin/<pkg> -- --run`: per-package Vitest. There is **no** root `npm run test`; each package owns its Vitest config. `traffic-light` has a small store smoke test.
- `node websocket-server/mock-addresses.js --check`: address/protocol static self-check.
- `node websocket-server/snapshot-diff-check.cjs`: snapshot-diff end-to-end check; forks a standalone relay on `:8082`, no `start:lab` needed, cleans up its child process.
- `node websocket-server/latency-report-check.cjs`: unit checks for the shared latency statistics module (bounded window, p95 index, date suffix, three-protocol labels, file writes and gateway wiring); no lab needed.
- `node scripts/check-first-screen.cjs`: assert the launcher first screen never preloads 3D/physics/device chunks (run after `build:platform`).
- `node scripts/cdp-first-screen-check.cjs`: real headless-Chrome CDP acceptance for launcher → device canvas and viewer workspace (requires a running `start:lab`; uses a fresh temp profile).
- `node scripts/cdp-viewer-sync-check.cjs`: dual-tab CDP acceptance for viewer device-lazy-load rendering, controller-leave cleanup and device switching (requires a running `start:lab`; uses a fresh temp profile).
- `node websocket-server/security-check.cjs`: runtime P0 trust-chain check, 42 assertions (requires a running `start:devlab`; includes frame-size limit, delta snapshot merge, forged trust headers, concurrent connect and opaque-origin rejection).
- `npm run electron:build:win:platform`: package the Windows Electron app.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation, semicolons, and ES module imports. Components, panels, and scene objects use PascalCase filenames such as `ScoringPanel.tsx`; hooks use `useXxx.ts`; Zustand stores follow `useXxxStore.ts`. Keep domain constants close to the owning feature. Use ESLint (`eslint.config.js`) before submitting changes.

## Testing Guidelines
Vitest runs in `jsdom`; each device package has its own `vite.config.ts` test section and colocated `*.test.ts` / `*.test.tsx` files. Prefer behaviour tests (mutate the store, call `tick`/`applyBroadcast`, assert values) over source-string assertions. Run the affected package's `npm run test -w @digital-twin/<pkg> -- --run` before committing; use focused mocks for hardware-facing services instead of relying on live PLC connections.

## Commit & Pull Request Guidelines
Recent history favors short, imperative summaries, often with a Conventional Commit prefix such as `feat:`. Follow `type: concise summary` when possible, or use a brief Chinese summary if that better matches the change. Keep each commit scoped to one feature or fix. PRs should explain the behavior change, list affected modes or scoring paths, link related issues, and include screenshots or short recordings for UI changes.

## Configuration & Safety Notes
Treat Modbus addresses, scoring definitions, and PLC interaction logic as high-risk areas. When changing `websocket-server/server.js`, `packages/shared/src/services/`, or any device's `manualIo.ts` / `simulationIo.ts`, document the assumption behind the protocol or state transition in the PR description. Internal ports must stay explicitly bound to `127.0.0.1`; only `:5201` is exposed to viewers. Position/volume is the single source of truth; taring or setting a zero point writes only an offset.

## 场景包导入契约（Scene Package Contract）
平台按目录自动发现场景包：把一个包放进 `packages/` 并重新构建即可挂载，新增并列场景**不需要改平台壳源码**。

**包必备文件**
- `device.json`：自描述。`id` 必须等于目录名；`order` 决定启动器顺序（缺省排末尾）；`name / icon / gradient / version / description / protocols / modeCount` 与 `src/index.ts` 实现逐项一致，加载时校验；`hasPhysics`、`needsPlcService` 供产物与 CDP 断言；`exportName` 是设备定义在 `src/index.ts` 的导出名。
- `src/device.ts`：统一入口 `export { <exportName> as device } from './index';`，平台为它生成独立懒加载 chunk。
- `src/index.ts`：导出符合 `DeviceDefinition` 的对象。契约类型在 `@digital-twin/shared`（`src/types/deviceContract.ts`），**禁止** import `@digital-twin/platform` 的实现。
- 最小配置集：`package.json`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`、`vite.config.ts`（含 test 段）。独立 Electron / Web 双入口、独立 `index.html` 与 `public/` 是历史遗留，新包不需要复制。

**自动派生，不要手改**：`packages/platform/src/deviceCatalog.ts` / `deviceMeta.ts` / `registry.ts`、`vite.config.ts` 的 alias、`tsconfig.app.json` 的通配 paths 与 include、`index.css` 的 `@source` glob、全部自检与 CDP 脚本。`scripts/device-catalog.cjs` 是 Node 侧的清单读取入口。

**资源与能力归属**：场景专属常量、点位表、面板、3D、实验指导书生成源放包内；交付可读产物由生成脚本写入 `packages/platform/public/docs/`。公共能力只放 `packages/shared`，场景包不得把点位表写进 shared 或网关。教学仿真模式连外部 PLC 编程软件的 simulator 或实物 PLC（Modbus TCP 通信控制或 DI/AI 端子控制）；内置虚拟 PLC 靶机只服务开发验收，需 `npm run start:devlab` 显式启用。网关 `DEFAULT_VARS` 与 shared 的 `MODBUS_ADDRESSES` 是遗留兼容层，值保持不变，新场景必须在 connect 帧显式下发 `variables` / `wordVariables`。

**边界**：根 `src/`、`electron/`、`vite.config.ts`、`index.html`、`dist*` 与各包内独立 Electron 入口均为历史遗留，不参与教学交付，也不要作为新包模板。运行时免构建热插拔未纳入：Three / Rapier 单实例、共享材质与 CSP 约束要求场景包与平台一起构建。

**导入后验收**：`npm run build:platform`、`node scripts/check-first-screen.cjs`、8 包 vitest、CDP 逐场景与双标签观众、`security-check.cjs`（需 `start:devlab`）。产物断言与 CDP 会自动覆盖新场景，无需改脚本。

完整开发规范见仓库根目录 `SCENE_DEVELOPMENT.md`（目标读者、实现契约、红线与自检映射、验收标准，以及第 10 章交付与收尾）；本节只保留维护者速查，两者冲突时按文档第 1 章的真值优先级裁决。
