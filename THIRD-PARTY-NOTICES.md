# 第三方依赖许可证（Third-Party Notices）

本项目自身的代码按仓库根目录 `LICENSE`（PolyForm Noncommercial License 1.0.0）授权。
**第三方依赖仍适用其各自的许可证**，本文件用于记录这些许可与分发时的义务。

生成方式：读取 `node_modules` 与 `websocket-server/node_modules` 中每个包
`package.json` 的 `license` 字段，并对字段缺失的包核对包内 `LICENSE` 文件
（2026-11-22 快照；升级依赖后应重新核对）。

## 1. 运行时依赖（随应用分发，需要保留许可声明）

| 依赖 | 版本 | 许可证 |
|---|---|---|
| react / react-dom | 19.2.4 | MIT |
| three | 0.183.1 | MIT |
| @react-three/fiber | 9.6.1 | MIT |
| @react-three/drei | 10.7.7 | MIT |
| @react-three/rapier | 2.2.0 | **Apache-2.0** |
| @dimforge/rapier3d-compat（Rapier 物理引擎本体） | 0.12.0 | **Apache-2.0** |
| zustand | 5.0.11 | MIT |
| ws | 8.21.0 | MIT |
| modbus-serial | 8.0.25 | ISC |
| nodes7 | 0.3.18 | MIT |
| mcprotocol（三菱 MC 协议，包内 `LICENSE` 为 MIT，`package.json` 未声明） | 0.1.2 | MIT |

## 2. 构建 / 开发期依赖（不随应用分发）

| 依赖 | 版本 | 许可证 |
|---|---|---|
| vite | 5.4.21 | MIT |
| electron | 34.5.8 | MIT |
| tailwindcss | 4.2.1 | MIT |
| typescript | 5.9.3 | Apache-2.0 |
| vitest | 3.2.4 | MIT |
| eslint | 9.39.3 | MIT |
| lightningcss / lightningcss-win32-x64-msvc | — | MPL-2.0 |
| caniuse-lite（数据包） | — | CC-BY-4.0 |
| webgl-constants（包内 `LICENSE` 为 MIT，`package.json` 未声明） | 1.1.1 | MIT |

传递依赖的许可证分布（顶层安装的 500 余个包）：MIT 379、ISC 62、Apache-2.0 18、
BSD-2-Clause 12、BSD-3-Clause 8、BlueOak-1.0.0 6、MPL-2.0 2，其余为 CC0 / 0BSD /
WTFPL / Python-2.0 等宽松许可。**未发现 GPL、AGPL、SSPL 等强 copyleft 依赖**。

## 3. 分发时的义务

1. **保留版权与许可声明**：以源码或安装包形式分发时，`node_modules` 中各依赖自带的
   `LICENSE` 文件必须随之保留，不得删除；本文件与根 `LICENSE` 一并保留。
2. **Apache-2.0（Rapier 物理引擎、TypeScript）**：需附带 Apache-2.0 许可副本；
   若修改了其源码，需在修改的文件中说明。本项目未修改 Rapier 源码。
3. **MPL-2.0（lightningcss，仅构建期）**：文件级 copyleft。本项目未修改其源码，
   且它不进入交付产物，因此无额外义务；若将来修改，需公开被修改文件的源码。
4. **CC-BY-4.0（caniuse-lite 数据）**：仅用于构建期生成浏览器兼容数据，不随产物分发。
5. **不得给依赖追加限制**：本项目的非商业许可只作用于本项目自己的代码，
   不能用来限制他人依据上述宽松许可对**依赖**本身的使用。

## 4. 与项目许可的兼容性

所有依赖均为宽松许可（MIT / ISC / BSD / Apache-2.0 / MPL-2.0 / BlueOak / CC0 等），
允许在更严格的条款下分发包含它们的整体作品，因此**本项目采用非商业许可与依赖许可无冲突**。
反之，如果将来引入 GPL / AGPL 依赖，则整个作品须按 GPL 发布，届时本项目的非商业条款
将无法维持，需先评估替换或取得例外授权。
