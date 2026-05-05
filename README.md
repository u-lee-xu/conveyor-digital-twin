# 数字孪生传送带分拣系统 V3

这是一个基于 React, Three.js 和 ModbusTCP 的数字孪生项目。

## 功能特点
- **手动模式**: 直接控制气缸、传送带和投放物料。
- **演示模式**: 自动运行分拣流程。
- **同步模式**: 与真实 PLC 状态实时同步。
- **仿真模式**: 网页作为虚拟产线，与 PLC (实体或仿真) 进行闭环控制调试。

## 运行环境
- Node.js (建议 v18+)
- ModbusTCP 服务器 (如仿真软件 Modbus Poll/Slave 或真实 PLC)

## 快速开始

### 1. 安装依赖
```bash
npm install
cd websocket-server && npm install
```

### 2. 启动服务 (推荐)
使用以下命令同时启动前端开发服务器和 WebSocket 代理服务器：
```bash
npm run start:all
```

或者分开启动：

**启动 WebSocket 代理服务器:**
```bash
npm run websocket:start
```

**启动前端:**
```bash
npm run dev
```

### 3. 停止服务
- 在终端中按 `Ctrl + C` 即可停止正在运行的服务。
- 如果使用了 `npm run start:all`，它会同时尝试终止前端和代理服务器进程。

## 通信架构
网页前端 <--WebSocket (8081)--> Node.js 代理服务器 <--ModbusTCP (502)--> PLC

## Modbus 地址定义 (线圈)
- 0: 启动
- 1: 复位
- 2-7: 气缸磁性开关反馈
- 8-10: 传感器反馈
- 100-102: 气缸控制阀
- 103: 传送带运行
