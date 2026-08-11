# 数字孪生传送带系统 - WebSocket版本

## 架构说明

这个版本使用WebSocket代理服务器实现网页前端与ModbusTCP的通信，不需要Electron封装。

```
网页前端 <--WebSocket--> WebSocket服务器 <--ModbusTCP--> PLC/ModbusTCP服务器
```

## 启动步骤

### 1. 安装依赖

```bash
# 安装前端依赖
cd digital-twin-v3
npm install

# 安装WebSocket服务器依赖
cd websocket-server
npm install
```

### 2. 启动WebSocket服务器

```bash
cd websocket-server
npm start
```

或者使用开发模式（自动重启）：
```bash
npm run dev
```

### 3. 启动前端

```bash
cd digital-twin-v3
npm run dev
```

前端会自动连接到 `ws://localhost:8080` 的WebSocket服务器。

## Modbus地址映射

### 线圈（写入传感器信号）
- 地址0: 上料传感器
- 地址1: 色标传感器
- 地址2: 物料传感器

### 离散输入（读取控制信号）
- 地址0: 上料气缸伸出
- 地址1: 上料气缸缩回
- 地址2: 分拣1气缸伸出
- 地址3: 分拣1气缸缩回
- 地址4: 分拣2气缸伸出
- 地址5: 分拣2气缸缩回
- 地址6: 传送带运行
- 地址7: 物料生成

## 使用说明

1. **启动WebSocket服务器**：先启动websocket-server，这是必须的
2. **启动前端**：然后启动前端应用
3. **连接ModbusTCP**：在前端界面中，选择同步模式或仿真模式，输入ModbusTCP服务器地址
4. **运行**：现在可以通过ModbusTCP与PLC通信

## 注意事项

- WebSocket服务器默认运行在端口8080
- 确保ModbusTCP服务器可以访问（本地网络或真实PLC）
- 如果WebSocket断开，前端会自动尝试重连

## 故障排除

### WebSocket连接失败
- 检查WebSocket服务器是否正在运行
- 检查防火墙是否阻止8080端口

### ModbusTCP连接失败
- 检查ModbusTCP服务器地址是否正确
- 检查网络连接是否正常
- 检查PLC是否支持ModbusTCP协议

### 传感器信号不更新
- 检查ModbusTCP连接是否成功
- 检查地址映射是否正确
- 查看WebSocket服务器日志
## 煤料智能分拣 仿真模式（mock-coal-server.js）

无硬件环境验证煤料场景"仿真模式"链路：前端连接面板 → 网关(8081) → 虚拟 PLC → 状态回读驱动 3D。

```bash
node mock-coal-server.js [端口]   # 默认 1502；演示端口被占用时可指定，如 1504
# 状态接口：http://127.0.0.1:5084/status   复位：/reset
```

地址表与 `packages/coal-sorting/src/scenes/coal-sorting/constants.ts` 一致（线圈 0-26）：

| 类别 | 线圈 | 说明 |
|---|---|---|
| 0-2 | BUTTON_START/STOP/ESTOP | 孪生按钮写入 |
| 3-6 | BELT1_RUN~BELT4_RUN | 程序驱动（依次启动 800ms） |
| 7-8 | FEED_CYL_EXTEND/RETRACT | 孪生气缸反馈 |
| 9 | SEPARATOR_ON | 程序驱动（启动完成后开启分拣机） |
| 10-19 | S1~S10 传感器 | 孪生模型反馈 |
| 20-21 | CYL_FEED_OUT/IN 磁性开关 | 孪生反馈 |
| 22-26 | IND_BELT1~4_RUN、IND_FAULT | 程序驱动（指示灯跟随皮带；急停亮故障灯） |

程序逻辑：启动上升沿 → 1#→4# 依次启带（800ms）→ 分拣机开 + 指示灯跟随；停止 → 全停；急停 → 全停 + 故障灯，复位后熄灭。
