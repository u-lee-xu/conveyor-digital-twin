# 数字孪生网关程序

## 功能说明

将PLC的ModbusTCP信号转换为MQTT消息，实现与数字孪生平台的通信。

### 两种工作模式

| 模式 | 说明 | 数据流向 |
|------|------|----------|
| 同步模式 | 真实设备状态同步到数字孪生 | PLC传感器 → 网关 → MQTT → 数字孪生显示 |
| 仿真模式 | PLC控制虚拟产线 | PLC控制 ↔ 网关 ↔ MQTT ↔ 数字孪生 |

## 环境要求

- Windows 10/11 或 Linux
- Python 3.10+

## 安装步骤

```bash
# 1. 进入程序目录
cd gateway

# 2. 安装依赖
pip install -r requirements.txt

# 3. 运行程序
python main.py
```

## 使用说明

### 1. 获取用户ID

从数字孪生平台获取你的用户ID（格式：`user-xxxxxx`）

### 2. 配置连接

| 配置项 | 说明 |
|--------|------|
| PLC地址 | PLC的IP地址，如 `192.168.1.100` |
| PLC端口 | ModbusTCP端口，默认 `502` |
| MQTT服务器 | MQTT Broker地址，如 `broker.emqx.io` |
| MQTT端口 | WebSocket端口，默认 `8084` (WSS) |
| 用户ID | 从平台获取的用户ID |

### 3. 选择工作模式

- **同步模式**：真实设备运行，将传感器状态同步到数字孪生
- **仿真模式**：无实物设备，PLC控制数字孪生中的虚拟产线

### 4. 启动网关

点击"启动"按钮开始运行

## Modbus地址定义

### 线圈（控制信号）

| 地址 | 名称 | 说明 |
|------|------|------|
| 0 | cylinder_feed_extend | 上料气缸伸出 |
| 1 | cylinder_feed_retract | 上料气缸缩回 |
| 2 | cylinder_sorting1_extend | 分拣1气缸伸出 |
| 3 | cylinder_sorting1_retract | 分拣1气缸缩回 |
| 4 | cylinder_sorting2_extend | 分拣2气缸伸出 |
| 5 | cylinder_sorting2_retract | 分拣2气缸缩回 |
| 6 | conveyor_run | 传送带运行 |
| 7 | material_spawn | 物料生成 |

### 离散输入（反馈信号）

| 地址 | 名称 | 说明 |
|------|------|------|
| 0 | sensor_feed | 上料传感器 |
| 1 | sensor_color | 色标传感器 |
| 2 | sensor_material | 物料传感器 |
| 3 | magnetic_feed_extend | 上料气缸伸出限位 |
| 4 | magnetic_feed_retract | 上料气缸缩回限位 |
| 5 | magnetic_sorting1_extend | 分拣1伸出限位 |
| 6 | magnetic_sorting1_retract | 分拣1缩回限位 |
| 7 | magnetic_sorting2_extend | 分拣2伸出限位 |
| 8 | magnetic_sorting2_retract | 分拣2缩回限位 |

## 打包为EXE

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "数字孪生网关" main.py
```

生成的exe文件在 `dist/` 目录下。

## 配置文件

配置保存在 `config/default.yaml`，可手动编辑。

## 常见问题

**Q: 连接PLC失败？**
- 检查PLC IP地址是否正确
- 检查网络是否连通（ping测试）
- 确认ModbusTCP端口是否开放（默认502）

**Q: 连接MQTT失败？**
- 检查服务器地址和端口
- 确认是否需要用户名密码
- 尝试关闭TLS（某些服务器不支持）

**Q: 用户ID从哪里获取？**
- 登录数字孪生平台，在同步或仿真模式面板中查看
