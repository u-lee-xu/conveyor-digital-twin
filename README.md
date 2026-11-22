# 数字孪生仿真教学平台

基于 React、Three.js / Rapier 与 Modbus TCP / Siemens S7 / 三菱 MX 的数字孪生教学平台。
`packages/platform` 是唯一交付入口，8 个教学设备各自成包并按设备懒加载。

## 教学设备
传送带分拣控制、气动机械手、交通灯、自动配药、MD520 变频器、汇川龙门 XY 象棋分拣、液体混装、电机正反转控制。

## 运行模式
- **手动 / 演示 / 仿真** 三档，各设备支持的模式以注册元数据为准。
- **仿真模式 = 虚拟场景 ↔ 外部 PLC 编程软件的 simulator 或实物 PLC**（Modbus TCP 通信控制，或 DI/AI 端子接线控制）；内置虚拟 PLC 不随教学交付启动，仅在开发 / 验收模式（`npm run start:devlab`）启用。
- 装软件的机器是主控（唯一连接 PLC），局域网观众通过教师机 IP 打开即为只读镜像。

## 场景包导入
平台按目录自动发现场景包：把符合导入契约的包放进 `packages/` 并重新构建，即可作为并列场景挂载，平台壳无需改源码。完整开发规范见 `SCENE_DEVELOPMENT.md`，维护者速查见 `AGENTS.md`「场景包导入契约」。根目录下的 `src/`、`electron/`、`vite.config.ts` 等是历史遗留，不属于交付入口。

## 运行环境
- Node.js (建议 v18+)
- ModbusTCP 服务器 (如仿真软件 Modbus Poll/Slave 或真实 PLC)

## 快速开始

### 1. 安装依赖
```bash
npm install
cd websocket-server && npm install
```

### 2. 构建平台壳
```bash
npm run build:platform
```

### 3. 启动教学实验室（推荐）
```bash
npm run start:lab
```
浏览器只访问 `http://127.0.0.1:5201/`；同网段观众访问 `http://<教师机IP>:5201/`（只读镜像）。
**角色只按协议与主机名判定**：主控机必须用 `localhost` / `127.0.0.1` 打开；即使用本机 LAN IP、内网穿透域名或 `127.0.0.2` 打开同一台机器，也会进入只读观众模式，这不是故障。观众请一律使用界面底部显示的教师机 IP。
`start:lab` 用 Vite preview 读 `packages/platform/dist`，**改过源码必须重做第 2 步**。

单独调试某个包时用 `npm run dev:platform` / `npm run dev:conveyor` 等；只启动网关用 `npm run websocket:start`；地址表自检用 `node websocket-server/mock-addresses.js --check`。

### 4. 停止服务
在 `start:lab` 终端按 `Ctrl + C`，网关 / 中继 / 虚拟 PLC 子进程与主进程一起退出。

## 通信架构
```
PLC 或 PLC 仿真软件 ⇄ :8081 网关（仅回环）⇄ 主控浏览器
主控 → store 快照 ~10Hz → :8082 中继（仅回环，只扇出）→ 观众浏览器
```
浏览器只连 `:5201` 的同源代理 `/ws/plc`、`/ws/relay`；内部端口一律显式绑 `127.0.0.1`，对外只开放 `:5201`。
仿真模式对接外部 PLC 仿真软件（Modbus TCP `:502` / S7 `:102` / 三菱），不依赖内置虚拟 PLC。

## Modbus 地址定义 (线圈)
- 0: 启动
- 1: 复位
- 2-7: 气缸磁性开关反馈
- 8-10: 传感器反馈
- 100-102: 气缸控制阀
- 103: 传送带运行

## 许可证

本项目以 [PolyForm Noncommercial License 1.0.0](LICENSE) 发布：

- **免费**：教学、教研、个人学习、学校与其他教育机构、非营利组织、政府机构使用，无需申请也无需付费，可修改、可再分发（需保留许可与 Required Notice）。
- **需授权**：任何以商业获利为目的的使用——收费培训与课程包、随商品或集成项目交付、托管服务（SaaS）、企业内部商业运营——须事先取得著作权人书面许可。
- 软件按「原样」提供，不含任何担保。

第三方依赖（React / Three.js / Rapier / Electron / Vite 等）仍适用各自许可证，均为 MIT、ISC、BSD、Apache-2.0 等宽松许可，与本项目的非商业条款不冲突；明细与分发义务见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
