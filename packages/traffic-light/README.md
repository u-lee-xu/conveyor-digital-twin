# 交通灯数字孪生系统

十字路口交通灯数字孪生仿真平台，基于 React + Three.js（react-three-fiber），用于信号灯控制教学与 PLC 联调。

## 功能特点

- **3D 十字路口场景**：东西/南北双向道路、车道虚线、停止线、斑马线、四根灯杆（每杆 3 盏灯，红→黄→绿）
- **双方向独立时序**：东西、南北两方向各自的绿稳 / 绿闪 / 黄灯时长可独立设置；红灯时长自动派生为对方方向绿稳+绿闪+黄灯之和
- **四种模式**：
  - **手动**：直接控制两方向 6 路信号灯
  - **演示**：自动运行双方向时序，面板实时显示各方向灯态与倒计时
  - **评分**：连接 PLC 后按预设评分规则自动评分（时序设置 + 灯态输出校验）
  - **仿真**：网页作为虚拟路口，与 PLC（实体或仿真）进行闭环控制调试
- **PLC 通信**：支持 ModbusTCP / S7 / 三菱 MC 协议，地址映射见帮助面板

## 时序模型

每个方向（东西 / 南北）由三段时间组成：

```
绿稳 → 绿闪 → 黄灯 → （对方方向） → 循环
```

- 红灯时长不可直接设置：`red(本方向) = 对方方向 (greenSteady + greenFlash + yellow)`
- 一个完整周期 = 东西 `(绿稳+绿闪+黄灯)` + 南北 `(绿稳+绿闪+黄灯)`
- 演示模式默认：绿稳 5s / 绿闪 3s / 黄灯 2s

## 快速开始

```bash
npm install
npm run dev          # 前端开发服务器
```

评分 / 仿真模式需先在面板中配置并连接 PLC（或使用 Modbus 仿真软件）。

## 目录结构

```
src/
├── App.tsx                     # 应用入口（模式切换、面板布局、移动端抽屉）
├── services/plc-websocket.ts   # PLC WebSocket 连接服务（含心跳保活）
├── stores/useAppStore.ts       # 模式与演示倒计时状态
└── scenes/traffic-light/
    ├── constants.ts            # 场景尺寸、时序模型、视觉常量
    ├── SceneContent.tsx        # 3D 场景（地面/道路/标线/灯杆/车辆）
    ├── useTrafficStore.ts      # 信号状态与双方向时序设置（localStorage 持久化）
    ├── useDemoSim.ts           # 演示模式时序调度
    ├── helpContent.ts          # 帮助面板内容（地址映射）
    ├── components/             # 3D 组件（灯杆、车辆、标签、场景容器）
    ├── hooks/useTrafficScoring.ts  # 评分规则
    └── panels/                 # 手动 / 演示 / 评分 / 仿真面板
```
