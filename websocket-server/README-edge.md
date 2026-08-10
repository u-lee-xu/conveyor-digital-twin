# 边缘设备部署（树莓派 + PLC + 浏览器访问）

## 拓扑

```
PLC ──以太网(Modbus TCP/S7/三菱MC)── 树莓派 ──WiFi/局域网── 教师PC（全量前端：3D+评分+操作）
                                          │
                                          └─ 状态广播(8082) ── 学生手机 ×N（只读观众页）
```

- **树莓派**：跑 `websocket-server`（8081，PLC 网关）+ `broadcast.js`（8082，状态广播）+ 前端静态文件
- **教师 PC**：浏览器访问树莓派前端，全量 3D 场景 + 评分 + 操作（连 8081）
- **学生手机**：浏览器访问 `/viewer.html`，**完整 3D 只读镜像**（订阅 8082 广播驱动同一套 3D 场景），每台手机独立渲染、可自由旋转视角，互不影响

## 部署步骤

```bash
# 1. 前端构建（可在任意机器上执行，产物复制到树莓派）
cd packages/conveyor-sorting
npm run build
# dist/ 即前端产物（index.html + viewer.html）

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
| 学生手机 | `http://<树莓派IP>/viewer.html` |

防火墙放行端口：80（或前端端口）、8081、8082。

## 网络要求

- 树莓派 eth0 与 PLC 同网段（静态 IP），如 PLC=192.168.1.10、树莓派=192.168.1.100
- 树莓派 wlan0 连教室 WiFi（与学生/教师同网段），或开 AP
- 学生手机与教师 PC 都能访问树莓派 wlan0 IP

## 说明

- 广播服务作为网关的"常驻客户端"复用 PLC 会话（网关支持多客户端共享），学生手机**不直连 PLC 网关**，避免与教师端互相干扰
- 教师端关闭页面后 PLC 会话保留，学生观众页仍能看到最后状态；重新打开教师端页面自动复用
- 观众页为只读镜像（无操作/评分入口）：传感器/气缸/皮带/信号塔由广播快照驱动 3D 场景，各手机自由旋转互不影响
- 手机性能建议：低端机型在 3D 场景右上角菜单可考虑关闭阴影（暂未开放，后续加降级开关）
