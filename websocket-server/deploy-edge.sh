#!/usr/bin/env bash
# ============================================================
# 边缘设备（树莓派）一键部署脚本
# 安装两个 systemd 服务：
#   1. dt-websocket  — PLC 通信网关（websocket-server，8081）
#   2. dt-broadcast  — 状态广播服务（broadcast.js，8082，供学生手机观众页订阅）
# 前端页面需另行静态托管（见 README-edge.md，推荐 nginx 或 vite preview --host）
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_USER="${SUDO_USER:-$(whoami)}"

echo "==> 1/3 安装网关服务 dt-websocket"
cat > /etc/systemd/system/dt-websocket.service << EOF
[Unit]
Description=Digital Twin PLC WebSocket Gateway (8081)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/node ${SCRIPT_DIR}/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> 2/3 安装广播服务 dt-broadcast"
cat > /etc/systemd/system/dt-broadcast.service << EOF
[Unit]
Description=Digital Twin Status Broadcast (8082, for viewer clients)
After=network.target dt-websocket.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/node ${SCRIPT_DIR}/broadcast.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> 3/3 启动并启用服务"
systemctl daemon-reload
systemctl enable --now dt-websocket.service
systemctl enable --now dt-broadcast.service

echo ""
echo "完成。服务状态："
systemctl --no-pager status dt-websocket.service | head -5
systemctl --no-pager status dt-broadcast.service | head -5
echo ""
echo "配置 PLC 参数：编辑 ${SCRIPT_DIR}/edge-broadcast.json 后执行 systemctl restart dt-broadcast"
echo "手机观众页：http://<树莓派IP>/viewer.html（需先托管前端构建产物）"
