# 场景开发文档

> **版本**：v1.1，跟随 `packages/shared/src/types/deviceContract.ts` 与 `device.json` schema
> **维护**：平台壳维护者；契约、自描述字段或自检脚本变更时必须同步更新本文
> **适用**：`packages/` 下所有自描述场景包，包括在本仓库之外单独开发后导入的包

本文是**规范与检查清单**，不是分步教程，也不复制 TypeScript 类型的全量定义。所有示例与命令均为只读核对或既有脚本调用。

---

## 1. 文档定位与裁决规则

**目标读者**：场景包开发者（内部或第三方，可能只有公共契约与本文）；平台维护者（审核导入包、维护契约）；验收 / QA（判定一个包是否达标）。

**不服务**：学生与教师（用实验指导书与教学手册）；只修改既有场景业务逻辑的人（用 `AGENTS.md` 与包内源码）；AI 会话上下文（本地项目记忆，按 `.gitignore` 不入库）。

**覆盖**：包结构与自描述、`DeviceDefinition` 实现口径、模式与状态真值、快照与观众镜像、PLC 与外部仿真软件边界、三维与视觉、面板与地址表、资源与配置归属、自检与验收、反模式。

**不覆盖**：平台壳内部实现；网关 / 中继协议实现；既有场景的业务逻辑与教学内容；部署与 Electron 打包；通用 React / Three.js 教学。**运行时免构建热插拔当前未实现**，本文不把它描述为可用能力。

**真值优先级（冲突时按此裁决，并回写本文）**：

1. `packages/shared/src/types/deviceContract.ts`、`packages/platform/src/deviceCatalog.ts` 中的类型与 `device.json` schema；
2. 自检 / 验收脚本（可执行约束，见第 9 章）；
3. 本文；
4. 本地历史审核报告等背景材料（不入库，仅作参考，不参与裁决）。

本文不得成为第二份真值：不写死场景数量或名单，不复制 API 全量字段，不描述未实现能力。`AGENTS.md` 的「场景包导入契约」是维护者速查，与本文是速查 / 正文关系。

---

## 2. 包结构与导入契约

### 2.1 必备文件

| 文件 | 职责 | 约束 |
|---|---|---|
| `device.json` | 场景自描述 | `id` 必须等于包目录名；字段见附录 A |
| `src/device.ts` | 统一入口 | 把 `device.json` 的 `exportName` 作为 `device` 转出，平台靠这个固定文件名生成懒加载 chunk |
| `src/index.ts` | 设备定义实现 | 导出符合 `DeviceDefinition` 的对象，只依赖 `@digital-twin/shared` 的契约与公共能力 |
| 最小配置集 | 独立开发与测试 | `package.json`、`tsconfig.json`、`tsconfig.app.json`、`tsconfig.node.json`、`vite.config.ts`（含 `test` 段） |

独立 Electron / Web 双入口、独立 `index.html`、`public/` 等属于历史遗留，新包不需要复制。根目录的 `src/`、`electron/`、`vite.config.ts`、`index.html`、`dist*` 不参与教学交付，也不能作为新包模板。

### 2.2 自动派生，禁止手改

平台按目录自动发现。以下位置从 `device.json` 派生或按 glob 生效，新增场景包时**不应修改**：

- `packages/platform/src/deviceCatalog.ts`（eager glob 收集元数据，按 `order` 排序）
- `packages/platform/src/deviceMeta.ts`、`packages/platform/src/registry.ts`（lazy glob 生成独立 chunk，加载时逐项核对元数据）
- `packages/platform/vite.config.ts` 的 alias、`packages/platform/tsconfig.app.json` 的通配 paths 与 include、`packages/platform/src/index.css` 的 `@source` glob
- `scripts/device-catalog.cjs`（Node 侧清单读取入口）以及全部 CDP / 首屏 / 自检脚本中的场景数量与名单

`platform/package.json` 的逐设备依赖是兼容声明，构建不再依赖它。

### 2.3 导入与发现

把一个符合上述契约的包放进 `packages/` 并重新构建一次，即成为并列场景：启动器卡片、观众懒加载、首屏分包断言、CDP 逐场景遍历、地址与产物自检自动纳入新包。教学形态与开发形态的启动入口分别是 `npm run start:lab` 与 `npm run start:devlab`。

---

## 3. `DeviceDefinition` 实现契约

契约类型在 `packages/shared/src/types/deviceContract.ts`；平台壳 `packages/platform/src/types.ts` 与 shared barrel 保留同名导出。设备包**禁止** import `@digital-twin/platform` 的实现。

| 字段组 | 要点 |
|---|---|
| 身份 | `id / name / icon / gradient / version / description / protocols / modeCount` 必须与 `device.json` 逐项一致；`registry.ts` 的 `assertDeviceMeta` 在加载时校验，不一致直接抛错 |
| 模式 | `modes` 声明本包实现的模式，`needsConnection` 标记需要 PLC 连接的模式；未声明的模式 UI 不显示 |
| 场景 | `SceneContent` 为 3D 内容；需要自带 Physics / Canvas 时用 `SceneWrapper`；`cameraPosition` 与机位目标由本包常量单一来源维护 |
| 侧栏与副作用 | `sidebarExtras` 常驻侧栏；`effects` 在整个工作区生命周期挂载（评分 Gate、调试钩子等），观众端不挂载 effects |
| 模式状态 | `useModeState` 返回 `{ mode, setMode }`，由本包 store 适配，不把模式写进全局状态 |
| 清理 | `onModeChange` 负责停止评分 / 断开连接等切模式清理；`onCleanup` 负责退出工作区清理 |
| 帮助 | `helpContent` 由本包注入，平台壳提供统一入口 |

**生命周期**：启动器只读取标量元数据 → 进入工作区时才懒加载实现 → 校验元数据 → 挂载场景与 effects → 切模式触发 `onModeChange` → 退出触发 `onCleanup`。首屏不得因新增场景引入 3D / 物理依赖。

---

## 4. 状态真值、快照与观众镜像

| 红线 | 说明 | 违反时的信号 |
|---|---|---|
| 唯一真值 | 位置 / 体积 / 机床坐标是唯一真值；3D、面板、快照、PLC 同源。去皮 / 设零点只写偏置，不改真值与 target，机构零位移 | 包级状态自检（如 `packages/liquid-mixing/src/__liquid_state_check.test.ts`）、`packages/auto-dispensing/src/__viewer_snapshot_check.test.ts` |
| 快照键名成对 | `exportSnapshot()` 与 `applyBroadcast()` 键名必须一致；快照来自 UI store 而非 PLC，演示 / 手动未连 PLC 也能同步 | `packages/auto-dispensing/src/__viewer_snapshot_check.test.ts`、`websocket-server/snapshot-diff-check.cjs` |
| 有限数守卫 | delta 只收 `boolean` 与有限 `number`；`NaN / Infinity / undefined` 不得进入 delta，也不得被当作删除标记 | `packages/auto-dispensing/src/__gateway_guard_check.test.ts`、`websocket-server/snapshot-diff-check.cjs` |
| 删除标记语义 | diff 用 `null` 表示键被删除；观众端对「帧里没带」的字段保留上次值，避免 PLC 帧偶发缺字段时状态跳变。动态数量的键应由计数重建，不依赖逐键删除 | `websocket-server/snapshot-diff-check.cjs`；协议级 `deletedKeys` **尚未实施**，属于已知限制 |
| 观众只读 | 观众零上行、不建 PLC 通道（`canOpenPlcChannel()` 守卫）、不挂 Rapier、关阴影、`dpr <= 1` | `websocket-server/mock-addresses.js --check`（viewer-isolation）、`scripts/cdp-viewer-sync-check.cjs` |
| 静止期保活 | 主控只发变化键，中继维持完整镜像并按 1s 保活扇出；空闲时不得产生 store 写入 | `packages/auto-dispensing/src/__gateway_guard_check.test.ts`、`websocket-server/snapshot-diff-check.cjs` |

相关实现：`packages/shared/src/sync/snapshotDiff.ts`、`packages/shared/src/sync/patchChanged.ts`、`websocket-server/snapshot-diff.js`、`packages/shared/src/services/wsEndpoints.ts`。

---

## 5. 模式与 PLC 边界

**仿真模式定义**：虚拟场景 ↔ 外部 PLC 编程软件的 simulator 或实物 PLC。允许两种控制方式：

- **通信控制**：设 `F0-02=2`、`F0-03=9` 一类命令源 / 频率源，PLC 程序通过 Modbus TCP 写控制字与频率给定、读状态字；
- **DI/AI 端子控制**：PLC 数字量输出接 DI 决定运行 / 方向 / 多段速，模拟量输出接 AI 给频率，不经过 WS 网关。

| 红线 | 说明 | 违反时的信号 |
|---|---|---|
| 手动 / 演示零帧 | 手动与演示模式完全不发 Modbus 帧，由本地状态机驱动 3D | 包级模式自检（如 `packages/auto-dispensing/src/__demo_command_check.test.ts`、`packages/inovance-gantry/src/__gantry_mode_check.test.ts`） |
| 仿真只受 PLC 控制 | 仿真模式由 PLC 输出回读驱动，回读不覆盖本地档位；两线圈同时得电属禁止态优先保持 | `packages/auto-dispensing/src/__sim_control_check.test.ts`、`__simulation_io_check.test.ts` |
| 内置虚拟 PLC 不交付 | 内置靶机仅开发 / 验收使用，需 `npm run start:devlab` 显式启用；教学 `start:lab` 不启动任何靶机 | `scripts/plc-ports-check.cjs`（教学形态报靶机未启用）、启动日志、`packages/auto-dispensing/src/__port_guard_check.test.ts` |
| 点位显式下发 | connect 帧必须显式给出 `variables` / `wordVariables`；不得依赖网关 `DEFAULT_VARS` 或 shared 中遗留的传送带点位表 | **契约约定，暂无自动拦截**；`websocket-server/security-check.cjs` 的 connect 用例覆盖显式下发；靠第 9 章验收清单核对 |
| 传感器回写 | 传感器必须回写 PLC，只在值变化时发帧，失败不更新本地掩码以便重试，观众端不写 | `packages/auto-dispensing/src/__simulation_io_check.test.ts`、`packages/liquid-mixing/src/__liquid_check.test.ts` |
| 三协议地址同源 | IO 点位表由 `manualIo.ts` / `simulationIo.ts` 派生，语义恒为「输入 = 孪生→PLC，输出 = PLC→孪生」；地址真值在包内常量表 | `websocket-server/mock-addresses.js --check`、`packages/auto-dispensing/src/__manual_io_check.test.ts` |
| 数值字序 | 通用 32 位 DINT 低字在前、FC03 读 / FC10 一帧写两字；液体 REAL 用双字透传 IEEE754 位模式；龙门 `x/y.position` 是 0~500mm 机床坐标，用 **uint16 单字**（历史草案里的 `_DINT` 命名不可按通用规则改回双字） | `websocket-server/mock-addresses.js --check`、`packages/liquid-mixing/src/__liquid_real32_check.test.ts`、`packages/inovance-gantry/src/__gantry_check.test.ts` |
| 现场地址不固化 | 外部 PLC 的 host 由连接面板按现场网络填写，不写死 IP；接实体 PLC 需在 `DT_PLC_HOSTS` 显式放行 | `scripts/start-lab.cjs`、`websocket-server/server.js`、`packages/auto-dispensing/src/__port_guard_check.test.ts` |

教学交付里不出现内置虚拟 PLC；开发靶机的端口与自检登记在 `scripts/start-lab.cjs`、`scripts/plc-ports-check.cjs` 与 `websocket-server/mock-addresses.js`。

---

## 6. 三维与视觉规范

| 红线 | 说明 | 违反时的信号 |
|---|---|---|
| 视觉单一来源 | 颜色、灯光、标签与间隙以 `packages/shared/src/styles/industrialVisual.ts` 为源；各包 `constants.ts` 从它派生 `SURFACE_GAP` | `packages/conveyor-sorting/src/__style_check.test.ts`、`packages/auto-dispensing/src/__assembly_check.test.ts` |
| 几何与碰撞体同源 | 可见几何与碰撞体必须来自同一份定义，不得两套尺寸 | 包级几何自检（如 `__assembly_check.test.ts`、`__model_detail_check.test.ts`） |
| 禁精确共面 | 新增可见面必须错开 ≥ `SURFACE_GAP`，否则 z-fighting 会随视角变色 | `packages/conveyor-sorting/src/__style_check.test.ts`、`__part_stage_check.test.ts` |
| 材质状态色 | 共享材质禁止逐帧改色；按状态二选一成组单例，颜色变化时切换引用 | `packages/auto-dispensing/src/__assembly_check.test.ts`、`packages/liquid-mixing/src/__liquid_state_check.test.ts` |
| 机位单一来源 | `?stage=` / `?view=` 机位与目标由各包自己的常量 / `cameraGoals` 单一来源维护，不在组件里散落坐标 | `packages/conveyor-sorting/src/__part_stage_check.test.ts`、`__style_check.test.ts` |
| 效果验收 | 低角度机位会把水平液面压成一条线；效果验收须近距俯看，并对截图像素颜色签名做量化 | `scripts/cdp-first-screen-check.cjs`、`scripts/plc-3d-link-check.cjs`（截图签名辅助佐证） |

---

## 7. 面板与地址表

| 红线 | 说明 | 违反时的信号 |
|---|---|---|
| 表头固定 | 地址表头恒为「信号 / 三菱 FX / Modbus TCP / Siemens S7」 | `packages/auto-dispensing/src/__panel_copy_check.test.ts`、`packages/liquid-mixing/src/__liquid_check.test.ts` |
| 地址派生 | 地址由 `*AddressRowsFor()` 从点位表派生；组件 / JSX 禁止出现地址字面量，查不到信号应直接抛错 | `packages/auto-dispensing/src/__manual_io_check.test.ts`、`__simulation_io_check.test.ts` |
| 紧凑面板浮框 | 紧凑面板用 hover / focus portal 浮框给三协议地址，`createPortal` 挂 `document.body` | `packages/auto-dispensing/src/__panel_copy_check.test.ts`、`packages/liquid-mixing/src/__liquid_check.test.ts` |
| 文案克制 | 不堆说明；可见文案不带中文括号 | `packages/auto-dispensing/src/__panel_copy_check.test.ts` |
| 地址选号 | 每个场景是独立 PLC 工程，地址只按本场景编程习惯**从低地址起、按信号类型分簇**；不得为避让其它场景而后移，也不得在测试 / 注释里写跨场景避让判断。MD520 手册规定的功能码地址除外 | `packages/liquid-mixing/src/__liquid_check.test.ts`、`packages/inovance-gantry/src/__gantry_mode_check.test.ts` |

参考实现：`packages/auto-dispensing/src/scenes/auto-dispensing/panels/AddressHint.tsx`。

**地址分配规范（场景内独立命名空间）**：

1. **P1 独立命名空间**：每个场景是独立 PLC 实验工程，地址只在本场景内有意义，不与其它场景比较；
2. **P2 从低地址起**：按编程习惯从 0 开始，不为避让其它场景后移；
3. **P3 按信号类型分簇**：REAL 双字 / 单字 / 输出线圈 / 反馈线圈各自连续成段；
4. **P4 禁止跨场景避让**：测试、注释、自检里不得写「必须大于某场景最大地址」，也不设全局地址台账或跨场景不重叠自检；
5. **P5 三协议同序同源**：三菱 / Modbus TCP / Siemens S7 三列由同一张点位表派生，组件与 JSX 禁地址字面量；
6. **P6 手册固有地址例外**：MD520 等功能码地址按设备手册规定，不适用 P2。

不串扰靠的是「唯一主控 + 每次 connect 整表替换 + 单工作区」的互斥约束，不是全局唯一地址空间。存量场景改址时必须同步五处真值（字变量表 / 线圈表 / 反馈表 / 三协议 BOOL 表 / 地址表），并用包内交叉一致性自检锁住；只按数值平移而不核对几何阈值，会误伤毫米常量。

---

## 8. 资源、材料与配置归属

| 资源 | 归属 |
|---|---|
| 场景专属常量、点位表、面板、3D 几何、store、模式状态机 | 场景包内 `src/` |
| 实验指导书 / 教学手册生成源与包内 HTML | 场景包内 `docs/`；生成脚本同时写入 `packages/platform/public/docs/` 供交付可读 |
| 公共能力（视觉令牌、物理组件、UI、运行时角色、同步、服务） | `packages/shared/src/`；场景包不得把点位表或业务逻辑写进 shared |
| 网关 / 中继 / 差分 / 延迟统计 | `websocket-server/`；场景包不得要求为其新增设备专属分支 |
| 开发靶机与帧级验收探针 | `websocket-server/` 与 `scripts/`，仅在 `start:devlab` 启用 |
| 平台壳接线（catalog / registry / alias / tsconfig / CSS / 自检） | 自动派生，禁止为单个场景手工登记 |

---

## 9. 自检、验收与排错

### 9.1 命令清单

| 命令 | 覆盖 | 前置形态 |
|---|---|---|
| `npm run lint` | ESLint 全量 | 无 |
| `npm run test -w @digital-twin/<pkg> -- --run` | 该包行为自检 | 无 |
| `node scripts/check-first-screen.cjs` | 首屏体积、按场景独立 chunk、无 PLC 服务场景不拖入服务 | `npm run build:platform` 之后 |
| `node websocket-server/mock-addresses.js --check` | 地址表同源、观众隔离、场景隔离、字序 | 无 |
| `node websocket-server/snapshot-diff-check.cjs` | 差分合并、删除标记、非法值、静止期保活 | 无（自带独立中继） |
| `node websocket-server/latency-report-check.cjs` | 延迟统计边界与三协议文案 | 无 |
| `node scripts/cdp-first-screen-check.cjs` | 真实 Chrome 逐场景 canvas、观众工作区 | 实验室已启动 |
| `node scripts/cdp-viewer-sync-check.cjs` | 双标签观众跟随、主控离开清场、切设备重渲染 | 实验室已启动 |
| `node scripts/plc-ports-check.cjs` | 开发靶机 FC01 / FC05 往返 | `npm run start:devlab` |
| `node scripts/plc-3d-link-check.cjs` | 外部写帧 → 网关 → store → 快照 → 观众画面 | `npm run start:devlab` |
| `node websocket-server/security-check.cjs` | 网关 connect / 读写 / DINT / 唯一主控 / 伪造信任头 / 观众只读 | `npm run start:devlab` |

教学交付形态用 `npm run start:lab`（Web + 网关 + 中继，无内置靶机）；开发验收形态用 `npm run start:devlab`。浏览器只访问 `:5201`。

### 9.2 达标判据

- 导入新包后平台壳源码零改动，重新构建一次即可挂载；
- 每个自描述场景都有独立的懒加载 chunk，首屏 gzip 与既有基线相比不退化；
- 启动器卡片顺序由 `order` 决定，元数据与实现逐项一致；
- 观众端能跟随、切设备重渲染、主控离开后清场，且全程零上行；
- 仿真模式连外部 PLC 编程软件 simulator / 实物 PLC，教学形态不出现内置靶机端口；
- 上述命令全部通过，且 CDP / 产物断言自动覆盖新场景，无需手改脚本。

### 9.3 常见失败与定位

| 现象 | 优先检查 |
|---|---|
| 卡片不出现或顺序不对 | `device.json` 的 `id` 是否等于目录名、`order` 是否缺失；`src/device.ts` 是否存在 |
| 构建报「元数据与注册表不一致」 | `device.json` 与 `src/index.ts` 的 name / icon / gradient / version / description / modeCount / protocols 逐项比对 |
| 进入场景白屏 | 先查 CSP 是否放行 wasm 编译；再查 `SceneContent` / `SceneWrapper` 挂载与控制台异常 |
| 观众画面不跟随 | `exportSnapshot` / `applyBroadcast` 键名是否成对；是否误把观众端接入 PLC 通道 |
| PLC 连不上 | 连接目标是否指向外部 PLC 仿真软件 / 实物 PLC；现场 IP 是否填写；`DT_PLC_HOSTS` 是否放行 |
| 产物断言提示 chunk 缺失 | 是否遗漏 `src/device.ts`；构建是否在新包放入之后执行 |

---

## 10. 交付与收尾

本章说明「场景包做完并通过第 9 章验收之后」的处理口径。命令仍以第 9 章清单为准，这里不重复。

### 10.1 验收留证与记录

| 项 | 口径 |
|---|---|
| 分层验收 | 静态（lint、8 包 vitest、首屏产物、地址 / 差分自检）、教学形态（逐场景 CDP、双标签观众、靶机端口未监听）、开发形态（安全自检、靶机端口、PLC↔三维联动）逐层留结果 |
| 现场手工测项 | 真实 S7-PLCSIM、GX Simulator2 / 实体 PLC 链路本机无法覆盖，必须明确列出，不得混入「全绿」结论 |
| 已知非回归 | 环境常驻的额外主控、外部未配置的商业软件等导致的个别失败单独记录原因与复现条件，不放宽断言 |
| 证据与记忆 | 结果写入审核报告新章节与当日工作日志（追加写）；证据页、截图、帧日志按项目约定不入库 |

### 10.2 同步与冻结

- 契约、自描述字段或接线方式变更时，同步顺序：本文 → 包内自检与接线脚本 → 场景构建 skill 的通用分支（仅接线形态变化时）→ 跑 `__scene_doc_check.test.ts`；该自检会拦住文档与代码漂移。项目侧适配档案不入库，只作 AI 会话上下文；自动发现口径以本文与 `packages/platform/src/deviceCatalog.ts` 为准。
- 教学材料改动时，用包内生成脚本重新生成三处同源产物（包内 HTML、`packages/platform/public/docs/`、场景内抽屉数据）。
- 新场景验收后进入冻结清单；后续工作不得顺手改动其它场景。冻结清单以 `scripts/device-catalog.cjs` 的扫描结果为准，不在文档里写死数量或名单。

### 10.3 版本控制

| 项 | 口径 |
|---|---|
| 提交范围 | 源码、`SCENE_DEVELOPMENT.md`、必要测试脚本与项目约定文件 |
| 不入库 | `.workbuddy/`、`.trae/`（本地 AI 工作数据）、`docs/` 大型素材、图片、`.vs/`、未入库素材包、临时探针与证据页、`dist`、`node_modules`、临时脚本与日志 |
| 授权边界 | 自动化工作默认只做到**暂存**；`commit` / `push` 需项目所有者明确授权。分支、领先提交数与暂存文件数以实际仓库状态为准，不写进本文 |
| 提交信息 | 按 `AGENTS.md` 的 Commit 约定，简短说明行为变化与受影响模式 |

### 10.4 交付与运行

- Web 教学形态：`npm run build:platform` → `npm run start:lab`。主控机访问本机 Web 端口，观众用界面实时显示的局域网 IP（不固化 IP）；仿真模式连外部 PLC 编程软件的 simulator 或实物 PLC，教学进程内没有内置虚拟 PLC。
- 开发验收形态：`npm run start:devlab` 才启用内置靶机，仅用于帧级回归脚本，不进入课堂。
- 桌面安装包：完整 `npm run electron:build:win:platform` 需在无批量删除保护的环境复跑，并核对打包资源里的网关本地依赖；Web 教学形态不受该限制影响。
- 交付给第三方：**场景包目录本身就是交付单元**（`device.json` + `src/device.ts` + `src/index.ts` + 最小配置集），不要附 `dist` / `node_modules`；导入方放进自己的 `packages/` 并构建一次即可挂载，不需要注册或发布到包仓库。

### 10.5 交接清单

一次场景开发收尾时，应交付：改动文件清单、各层验证结果与证据、已知限制与现场手工测项、当前版本控制状态（已暂存 / 未提交）、以及需要项目所有者拍板的事项（提交与推送、桌面安装包复跑）。不代为提交、推送或发布。

---

## 附录 A：`device.json` 字段速查

| 字段 | 类型 | 含义 |
|---|---|---|
| `id` | string | 必须等于包目录名 |
| `order` | number | 启动器卡片顺序，缺省排末尾 |
| `name` / `icon` / `gradient` / `version` / `description` | string | 与 `src/index.ts` 实现逐项一致 |
| `protocols` | string[] | 支持的 PLC 协议，与实现一致 |
| `modeCount` | number | 等于 `modes.length` |
| `hasPhysics` | boolean | 是否依赖 Rapier / wasm，供 CDP 断言 |
| `needsPlcService` | boolean | 是否依赖 shared 的 PLC 服务，供首屏产物断言 |
| `exportName` | string | `src/index.ts` 中设备定义的导出名，`src/device.ts` 用它转出 `device` |

字段的机器可读真值是 `packages/platform/src/deviceCatalog.ts` 的 `SceneDescriptor`（继承 `DeviceMeta`），Node 侧读取入口是 `scripts/device-catalog.cjs`。

---

## 附录 B：反模式清单

- 在平台壳、CDP 脚本或自检里写死场景数量、中文名数组或包名列表；
- 依赖网关 `DEFAULT_VARS` 或 shared 中遗留的传送带点位表，不在 connect 帧显式下发点位；
- 让观众端建立 PLC 通道、上行写帧或挂载 Rapier；
- 演示 / 手动模式发送 Modbus 帧，或用本地状态机覆盖 PLC 回读；
- 把内置虚拟 PLC / 开发靶机写进教学交付路径；
- 逐帧修改共享材质颜色、新增精确共面、几何与碰撞体两套尺寸；
- 在组件 / JSX 里写地址字面量、改地址表头、在可见文案里加中文括号；
- 复制历史包的独立 Electron / Web 双入口作为新包模板；
- 把运行时免构建热插拔当作已实现能力来设计。

---

## 附录 C：术语表

| 术语 | 含义 |
|---|---|
| 场景包 | `packages/` 下带 `device.json` 与 `src/device.ts` 的自描述目录 |
| 主控 | 装软件的机器，唯一连接 PLC、可操作 |
| 观众 | 通过教师机 IP 访问的只读镜像，零上行 |
| 快照 | 主控 `exportSnapshot()` 导出的 store 渲染态，经中继扇出给观众 |
| delta | 主控只发变化键的差分帧，`null` 为删除标记 |
| 内置虚拟 PLC | 仅开发 / 验收使用的本机 Modbus 从站靶机，教学交付不启动 |
| 开发靶机 | `npm run start:devlab` 下启用的帧级回归目标 |
| 唯一真值 | 位置 / 体积 / 机床坐标等由同一份状态驱动 3D、面板、快照与 PLC 的原则 |
