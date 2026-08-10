# 边缘设备部署（树莓派 + PLC + 浏览器访问）

## 拓扑

```
PLC ──以太网(Modbus TCP/S7/三菱MC)── 树莓派 ──WiFi/局域网── 教师PC（全量前端：3D+评分+操作）
                                          │
                                          └─ 状态广播(8082) ── 学生手机 ×N（观众模式）
```

- **树莓派**：跑 `websocket-server`（8081，PLC 网关）+ `broadcast.js`（8082，状态广播）+ 前端静态文件
- **教师 PC**：浏览器访问树莓派前端，全量 3D 场景 + 评分 + 操作（连 8081）
- **学生手机**：浏览器访问同一入口，选「观众模式」，**完整 3D 只读镜像**（订阅 8082 广播驱动同一套 3D 场景），每台手机独立渲染、可自由旋转视角，互不影响

## 部署步骤

```bash
# 1. 前端构建（可在任意机器上执行，产物复制到树莓派）
cd packages/conveyor-sorting
npm run build
# dist/ 即前端产物（唯一入口 index.html，含主控/观众双角色）

# 2. 树莓派上安装网关 + 广播服务（需要 root）
cd websocket-server
npm install            # 安装 ws / modbus-serial / nodes7 依赖
sudo bash deploy-edge.sh

# 3. 配置 PLC 参数（protocol/host/port/轮询变量）
vi edge-broadcast.json
sudo systemctl restart dt-broadcast

# 4. 托管前端静态文件（任选其一）
#    a) nginx
#    b) 简单静态服务：cd dist && npx vite preview --host --port 80
```

## 访问

| 角色 | 地址 |
|---|---|
| 教师 PC | `http://<树莓派IP>/` |
| 学生手机 | `http://<树莓派IP>/` → 观众模式 |

防火墙放行端口：80（或前端端口）、8081、8082。

## 网络要求

- 树莓派 eth0 与 PLC 同网段（静态 IP），如 PLC=192.168.1.10、树莓派=192.168.1.100
- 树莓派 wlan0 连教室 WiFi（与学生/教师同网段），或开 AP
- 学生手机与教师 PC 都能访问树莓派 wlan0 IP

## 说明

- 广播服务作为网关的"常驻客户端"复用 PLC 会话（网关支持多客户端共享），学生手机**不直连 PLC 网关**，避免与教师端互相干扰
- 统一入口分两个角色：**主控**（教师，选设备→连接 PLC→演示/评分）与**观众**（学生，只读）
- 观众默认**跟随主控**：主控进入设备工作区→自动切到该设备 3D 场景；主控未进入/离开→黑屏等待页；学生也可自选设备（自选同样向广播请求切换）
- 设备由广播快照 deviceId 决定（传送带分拣/气动机械手/交通灯，各设备 PLC 参数在 edge-broadcast.json 分别配置）
- 手机性能建议：低端机型在 3D 场景右上角菜单可考虑关闭阴影（暂未开放，后续加降级开关）
