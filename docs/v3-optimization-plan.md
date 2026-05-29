# V3 优化方案

> 目标：在保证 V3 项目完整性和稳定性的前提下，对现有系统进行渐进式优化，为 V4 全面重构奠定基础。

---

## 一、当前架构概览

```
src/
├── components/
│   ├── panels/          # UI 面板（控制、状态、评分、仿真、PLC连接等）
│   ├── scene/           # 3D 场景组件（传送带、气缸、传感器、物料等）
│   │   └── shared/      # 场景常量、几何体、材质
│   └── ui/              # 基础 UI 组件（按钮、模式选择器等）
├── hooks/               # 业务逻辑 Hook
│   ├── usePhysics.ts    # 手动物理模拟（requestAnimationFrame + 坐标计算）
│   ├── useConveyorScoring.ts  # 评分逻辑
│   ├── useSimMode.ts    # 仿真模式逻辑
│   ├── useDemoMode.ts   # 演示模式逻辑
│   └── useScoring.ts    # 评分辅助
├── services/
│   ├── modbus-websocket.ts  # PLC 通信服务（Modbus TCP + S7 协议适配）
│   └── modbus.ts            # Modbus 地址常量
├── stores/
│   └── useDeviceStore.ts    # Zustand 全局状态
├── types/               # TypeScript 类型定义
├── constants/           # PLC 地址常量
└── App.tsx              # 应用入口
```

**通信架构**：前端 ↔ WebSocket(8081) ↔ Node.js 代理服务器 ↔ PLC(ModbusTCP:502 / S7:102)

---

## 二、现有问题分析

### 2.1 物理模拟层

| 问题 | 说明 |
|------|------|
| 手动坐标计算 | `usePhysics.ts` 通过 `requestAnimationFrame` + X/Z 坐标比较实现碰撞检测，无法处理复杂碰撞场景 |
| 单物料限制 | 系统同时只支持一个物料，无法模拟多物料并发场景 |
| 传感器检测不精确 | 传感器基于 X 坐标范围判断，物料高速移动时可能跳过检测 |
| 气缸碰撞简化 | 气缸推动仅通过 Z 轴位移模拟，没有真实的刚体碰撞效果 |

### 2.2 场景与组件

| 问题 | 说明 |
|------|------|
| 场景硬编码 | 所有设备位置、参数硬编码在 `constants.ts`，无法动态配置 |
| 单一场景 | 仅支持传送带分拣一种场景，无法扩展为机械手、电梯等 |
| 组件耦合 | 场景组件直接依赖全局 Store，难以复用 |

### 2.3 通信与协议

| 问题 | 说明 |
|------|------|
| S7 连接稳定性 | S7 协议连接偶尔掉线，需要更健壮的重连机制 |
| 错误提示不足 | PUT/GET 未开启时无明确报错，用户误以为软件故障 |
| 通信频率固定 | 轮询/反馈/心跳频率硬编码，无法根据网络状况自适应 |

### 2.4 评分系统

| 问题 | 说明 |
|------|------|
| 单一评分方案 | 仅有一套传送带分拣评分规则，无法支持多场景考核 |
| 无考核模式 | 缺少限时考核、随机出题等考核功能 |

---

## 三、优化方案（按优先级排序）

### 阶段一：物理引擎升级（Rapier.js）

**目标**：用 Rapier.js 刚体物理引擎替代手动物理计算，实现真实碰撞检测。

**涉及文件**：
- 新增：`src/components/scene/PhysicsScene.tsx` — Rapier 物理场景
- 修改：`src/App.tsx` — 添加场景切换逻辑
- 修改：`src/hooks/usePhysics.ts` — 适配双物理引擎
- 修改：`package.json` — 添加 `@react-three/rapier` 依赖

**实现步骤**：

1. **安装依赖**
   ```bash
   npm install @react-three/rapier
   ```

2. **创建 PhysicsScene.tsx**
   - 使用 `<Physics>` 包裹场景
   - `<ConveyorBelt>` 使用 `RigidBody` + `setLinvel` 模拟传送带摩擦
   - `<PhysicsSensor>` 使用 `CuboidCollider sensor` 实现传感器检测
   - `<Cylinder>` 使用 `kinematicPosition` 类型实现气缸运动
   - `<Material>` 使用动态 `RigidBody` 实现物料物理

3. **App.tsx 添加场景切换**
   - 添加 `useNewPhysics` 状态
   - 条件渲染：旧场景 `<Scene>` / 新场景 `<PhysicsScene>`
   - 添加"物理引擎"切换 UI 面板

4. **适配 usePhysics.ts**
   - 新物理引擎模式下，跳过手动物理计算
   - 保留旧模式作为回退

5. **构建验证**
   - 确保 `npm run build` 通过
   - 确保 `npm run test` 通过

**注意事项**：
- Rapier.js 的 `RigidBody` 没有 `setSurfaceVelocity` 方法，需用 `setLinvel` 或摩擦力模拟传送带
- `Physics` 组件的 `gravity` 参数接受 `[x, y, z]` 数组格式，不是对象格式
- 物料颜色类型 `MaterialColor` 为 `'blue' | 'black'`，比较时需注意类型兼容

---

### 阶段二：多物料支持

**目标**：支持传送带上同时存在多个物料，实现更真实的分拣模拟。

**涉及文件**：
- 修改：`src/stores/useDeviceStore.ts` — 物料从单对象改为数组
- 修改：`src/types/device.ts` — 更新物料相关类型
- 修改：`src/hooks/usePhysics.ts` — 多物料物理计算
- 修改：`src/components/scene/Material.tsx` — 渲染多个物料
- 修改：`src/hooks/useConveyorScoring.ts` — 适配多物料评分
- 修改：`src/hooks/useSimMode.ts` — 适配多物料仿真

**实现步骤**：

1. **类型改造**
   ```typescript
   // device.ts
   export interface MaterialItem {
     id: string;
     visible: boolean;
     color: MaterialColor;
     position: [number, number, number];
     onConveyor: boolean;
   }
   ```

2. **Store 改造**
   - `material` 从单对象改为 `materials: MaterialItem[]`
   - `spawnMaterial()` 创建新物料并加入数组
   - `clearMaterial(id)` 清除指定物料
   - `updateMaterialPosition(id, position)` 更新指定物料位置

3. **物理引擎适配**
   - 遍历 `materials` 数组进行物理计算
   - 每个物料独立维护速度和碰撞状态

4. **场景渲染适配**
   - `Material` 组件接收 `materials` 数组，渲染多个物料实例

5. **评分/仿真适配**
   - 评分逻辑按物料 ID 跟踪
   - 仿真模式支持多物料反馈

---

### 阶段三：场景配置化

**目标**：通过 JSON 配置文件定义场景，支持多场景切换。

**涉及文件**：
- 新增：`src/config/scenes/` — 场景配置目录
- 新增：`src/config/scenes/conveyor-sorting.json` — 传送带分拣场景配置
- 新增：`src/types/scene.ts` 扩展 — 场景配置类型
- 修改：`src/App.tsx` — 场景选择器
- 修改：`src/stores/useDeviceStore.ts` — 当前场景状态

**配置结构设计**：
```typescript
interface SceneConfig {
  id: string;
  name: string;
  description: string;
  devices: {
    conveyors: ConveyorConfig[];
    cylinders: CylinderConfig[];
    sensors: SensorConfig[];
    materialTables: MaterialTableConfig[];
    signalTowers: SignalTowerConfig[];
  };
  physics: {
    gravity: [number, number, number];
    conveyorSpeed: number;
  };
  scoring: ScoringConfig;
  plcMapping: {
    modbus: Record<string, number>;
    s7: Record<string, string>;
  };
}
```

**实现步骤**：

1. 定义场景配置 TypeScript 类型
2. 将现有传送带分拣场景提取为 JSON 配置
3. 实现场景加载器，根据配置动态创建场景组件
4. 添加场景选择 UI
5. 确保旧场景完全兼容

---

### 阶段四：评分系统增强

**目标**：支持多套评分方案、考核模式、随机出题。

**涉及文件**：
- 新增：`src/config/scoring/` — 评分配置目录
- 修改：`src/hooks/useConveyorScoring.ts` — 支持多评分方案
- 修改：`src/components/panels/ScoringPanel.tsx` — 评分方案选择 UI
- 新增：`src/hooks/useExamMode.ts` — 考核模式 Hook

**功能设计**：

1. **多评分方案**
   - 基础评分：当前传送带分拣评分
   - 进阶评分：增加时序要求、多物料评分
   - 自定义评分：用户可配置评分项

2. **考核模式**
   - 限时考核：设定时间限制
   - 随机出题：随机选择物料颜色序列
   - 成绩记录：保存考核结果

3. **评分配置化**
   ```typescript
   interface ScoringConfig {
     id: string;
     name: string;
     timeLimit?: number;
     modules: ScoringModuleDef[];
   }
   ```

---

### 阶段五：通信层优化

**目标**：提升 S7/Modbus 通信稳定性，改善错误提示。

**涉及文件**：
- 修改：`websocket-server/server.js` — 通信重连优化
- 修改：`src/services/modbus-websocket.ts` — 前端通信优化
- 修改：`src/components/panels/PlcConnectionPanel.tsx` — 错误提示增强

**优化项**：

1. **S7 连接稳定性**
   - 增加连接状态心跳检测
   - 自动重连机制（指数退避）
   - 连接超时处理

2. **错误提示增强**
   - S7 连接失败时区分"TCP已连接但ISO未连接"（PUT/GET未开启）和"TCP未连接"（网络不通）
   - 在 UI 上显示具体的连接失败原因和解决建议
   - 连接统计实时展示

3. **通信频率自适应**
   - 根据网络延迟动态调整轮询频率
   - 高延迟时自动降频，低延迟时恢复

---

### 阶段六：UI/UX 优化

**目标**：提升用户体验，优化界面交互。

**优化项**：

1. **响应式布局优化**
   - 移动端适配改进
   - 面板可折叠/拖拽

2. **3D 场景优化**
   - 模型细节提升（更真实的传送带、气缸外观）
   - 粒子效果（物料掉落、气缸动作反馈）
   - 相机预设视角

3. **操作引导**
   - 首次使用引导
   - 操作提示气泡
   - 快捷键支持

---

## 四、V4 重构规划

V4 将基于 V3 优化的经验，从头重新设计架构：

### 核心设计理念
1. **场景驱动**：一切以场景配置为核心，UI 和逻辑由配置驱动
2. **插件化架构**：设备组件、评分方案、通信协议均为可插拔模块
3. **多场景原生支持**：传送带分拣、机械手、电梯等场景平等支持
4. **考核系统内置**：多套练习题和考核题，支持随机出题和成绩管理

### 技术栈
- 前端：React 19 + Three.js + Rapier.js + Zustand
- 通信：Modbus TCP + S7 Protocol + OPC UA（预留）
- 桌面：Electron
- 构建：Vite

### 目录结构（初步）
```
src/
├── core/                # 核心框架
│   ├── engine/          # 物理引擎抽象层
│   ├── communication/   # 通信协议抽象层
│   └── scoring/         # 评分引擎抽象层
├── scenes/              # 场景模块
│   ├── conveyor/        # 传送带分拣
│   ├── robot-arm/       # 机械手
│   └── elevator/        # 电梯
├── components/          # 通用 UI 组件
├── config/              # 配置文件
└── stores/              # 状态管理
```

---

## 五、开发顺序与里程碑

| 阶段 | 内容 | 预计工作量 | 依赖 |
|------|------|-----------|------|
| 1 | Rapier.js 物理引擎升级 | 中 | 无 |
| 2 | 多物料支持 | 中 | 阶段1 |
| 3 | 场景配置化 | 大 | 阶段2 |
| 4 | 评分系统增强 | 中 | 阶段3 |
| 5 | 通信层优化 | 小 | 无 |
| 6 | UI/UX 优化 | 中 | 阶段1 |

> 注：阶段5（通信层优化）和阶段6（UI/UX优化）可独立进行，不依赖其他阶段。

---

## 六、风险与注意事项

1. **向后兼容**：每个阶段必须保证现有功能不受影响，旧场景必须可用
2. **构建验证**：每次修改后必须 `npm run build` + `npm run test` 通过
3. **Git 管理**：每个阶段完成后 git commit 并推送，确保可回滚
4. **Rapier.js 兼容性**：需确认 `@react-three/rapier` 与当前 Three.js 版本兼容
5. **S7 协议安全**：修改通信层时，需在 PR 中说明协议假设和状态变更
6. **Electron 打包**：添加新依赖后需验证 Electron 打包是否正常
