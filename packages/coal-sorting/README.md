# 煤料智能分拣系统

工业级煤料输送与智能分拣数字孪生仿真平台，基于 React + Three.js（react-three-fiber）+ Rapier 物理引擎，用于带式输送与气吹分拣教学、PLC 联调。

## 功能特点

- **3D 输送分拣场景**：四条皮带（1# 给料 → 2# 筛分整列 → 3# 净煤收集 / 4# 筛下运送）、上料气缸、气吹分拣机、10 路传感器（含堆料检测）
- **物理仿真**：煤/矸石物料按尺寸分档，皮带运输、边缘跌落、气吹抛离均由 Rapier 物理引擎驱动
- **四种模式**：
  - **手动**：皮带启停与故障注入、上料气缸点动、气吹分拣手动触发、堆料检测演示
  - **演示**：自动运行工艺序列（皮带依次启动 → 自动投料 → 筛分分拣），面板实时显示当前步骤、皮带运行状态与物料统计
  - **评分**：连接 PLC 后进行程序考核评分（评分规则开发中，面板已就位）
  - **仿真**：网页作为虚拟产线，与 PLC（实体或仿真）进行闭环控制调试
- **PLC 通信**：支持 ModbusTCP / S7 / 三菱 MC 协议，地址映射见帮助面板
- **仿真 IO 双向同步**：PLC 输出 → 皮带/气缸/分拣机/指示灯执行；传感器与磁性开关状态 → 写回 PLC 输入

## 工艺模型

```
1# 给料(皮带) ──► 2# 筛分整列(皮带) ──┬──► 3# 净煤收集(皮带)
        ▲                               └──► 4# 筛下运送(皮带)
        └── 上料气缸（磁性开关反馈）
```

- 上料气缸由仿真侧投料（煤/矸石随机或指定比例），PLC 控制皮带启停与气吹分拣
- 气吹分拣：命中分拣机触发区内的物料按 `SEPARATOR_ON` 输出被吹离皮带（煤矸分离演示）
- 传感器：`S1/S3、S4/S6、S7/S9` 为皮带端部检测，`S2/S5/S8` 为皮带运行检测（皮带运行且有料），`S10` 堆料（1# 入口有料且 1# 未运行），`CYL_FEED_OUT/IN` 为上料气缸磁性开关

## PLC IO 信号

| 方向 | 变量 | 数量 | 说明 |
| --- | --- | --- | --- |
| DT → PLC（写入） | `BUTTON_START/STOP/ESTOP`、`S1~S10`、`CYL_FEED_OUT/IN` | 15 | 主令按钮、传感器、磁性开关 |
| PLC → DT（读取） | `BELT1~4_RUN`、`FEED_CYL_EXTEND/RETRACT`、`SEPARATOR_ON`、`IND_BELT1~4_RUN`、`IND_FAULT` | 12 | 皮带运行、气缸电磁阀、分拣机、指示灯 |

三协议地址对照（Modbus 线圈 / S7 M 区 / 三菱 X·Y 区）见仿真面板「帮助」。

## 快速开始

```bash
npm install
npm run dev          # 前端开发服务器
```

评分 / 仿真模式需先在面板中配置并连接 PLC（或使用 Modbus 仿真软件）。

## 目录结构

```
src/
├── App.tsx                          # 应用入口（模式切换、面板布局、移动端抽屉）
├── services/plc-websocket.ts        # PLC WebSocket 连接服务（三协议，含心跳保活）
├── stores/useAppStore.ts            # 模式与演示/仿真运行状态
├── index.css                        # 统一 UI 组件类库（卡片/按钮/徽章/指示灯）
└── scenes/coal-sorting/
    ├── constants.ts                 # 场景尺寸、物理参数、三协议 IO 地址表
    ├── SceneContent.tsx             # 3D 场景（皮带/气缸/分拣机/传感器/物料）
    ├── useBeltStore.ts              # 皮带、传感器、物料状态（传感器批量差量更新）
    ├── materialRegistry.ts          # 物料位置注册表（每帧免 setState 集中检测）
    ├── components/
    │   ├── BeltMaterialItem.tsx     # 物料物理实体（皮带推进/跌落/气吹状态机）
    │   ├── SensorDetector.tsx       # 传感器真值集中计算与批量回写
    │   └── helpers.ts               # 坐标转换与皮带检测工具
    ├── hooks/useBeltDemoSim.ts      # 演示模式工艺序列调度
    ├── helpContent.ts               # 帮助面板内容（三协议地址映射）
    └── panels/                      # 手动 / 演示 / 评分 / 仿真面板
```

## 测试

```bash
npm test
```

单元测试覆盖皮带/传感器状态转换与物料生成逻辑（`useBeltStore.test.ts`）。
