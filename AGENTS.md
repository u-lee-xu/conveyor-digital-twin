# Repository Guidelines

## Project Structure & Module Organization
The main app lives in `src/` and is split by responsibility: `components/` for UI and 3D scene pieces, `hooks/` for mode logic and scoring flows, `stores/` for Zustand state, `services/` for Modbus/WebSocket access, and `types/` for shared TypeScript models. Electron entry points are in `electron/`. The standalone Modbus bridge is in `websocket-server/`. Reference docs and scoring tables are in `docs/` and root-level `.md`/`.csv` files. Build outputs (`dist/`, `dist-electron/`, `release/`) are generated artifacts and should not be edited by hand.

## Build, Test, and Development Commands
Run `npm install` in the root, then `npm install` inside `websocket-server/` on first setup.

- `npm run dev`: start the Vite frontend.
- `npm run websocket:dev`: run the WebSocket bridge with auto-reload.
- `npm run start:all`: start frontend and bridge together for local integration work.
- `npm run build`: type-check and build the frontend bundle.
- `npm run electron:build:win`: package the Windows Electron app.
- `npm run lint`: run ESLint on `ts` and `tsx` files.
- `npm run test`: run Vitest.

## Coding Style & Naming Conventions
Use TypeScript with 2-space indentation, semicolons, and ES module imports. Components, panels, and scene objects use PascalCase filenames such as `ScoringPanel.tsx`; hooks use `useXxx.ts`; Zustand stores follow `useXxxStore.ts`. Keep domain constants close to the owning feature. Use ESLint (`eslint.config.js`) before submitting changes.

## Testing Guidelines
Vitest runs in `jsdom` with setup from `src/test/setup.ts`. Place tests beside the source file using `*.test.ts` or `*.test.tsx`, for example `src/hooks/useConveyorScoring.test.ts`. Cover store transitions, scoring rules, and Modbus-facing logic with deterministic unit tests. Run `npm run test` before opening a PR; use focused mocks for hardware-facing services instead of relying on live PLC connections.

## Commit & Pull Request Guidelines
Recent history favors short, imperative summaries, often with a Conventional Commit prefix such as `feat:`. Follow `type: concise summary` when possible, or use a brief Chinese summary if that better matches the change. Keep each commit scoped to one feature or fix. PRs should explain the behavior change, list affected modes or scoring paths, link related issues, and include screenshots or short recordings for UI changes.

## Configuration & Safety Notes
Treat Modbus addresses, scoring definitions, and PLC interaction logic as high-risk areas. When changing `src/services/`, `src/hooks/useScoring.ts`, or `src/hooks/useConveyorScoring.ts`, document the assumption behind the protocol or state transition in the PR description.
