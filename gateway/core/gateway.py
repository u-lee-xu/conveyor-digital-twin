"""
网关核心模块
"""
import logging
import time
import threading
from typing import Optional
from enum import Enum

from config import GatewayConfig
from .modbus_client import ModbusClient
from .mqtt_client import MqttClient, MqttMessage

logger = logging.getLogger(__name__)


class GatewayState(Enum):
    """网关状态"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class Gateway:
    """网关核心"""
    
    def __init__(self, config: GatewayConfig):
        self.config = config
        
        # 初始化客户端
        self.modbus = ModbusClient(
            host=config.modbus.host,
            port=config.modbus.port,
            unit_id=config.modbus.unit_id,
            timeout=config.modbus.timeout,
        )
        
        self.mqtt = MqttClient(
            broker=config.mqtt.broker,
            port=config.mqtt.port,
            use_tls=config.mqtt.use_tls,
            username=config.mqtt.username,
            password=config.mqtt.password,
            keepalive=config.mqtt.keepalive,
            user_id=config.user_id,
        )
        
        # 状态
        self.state = GatewayState.STOPPED
        self._running = False
        self._thread: Optional[threading.Thread] = None
        
        # 回调
        self.on_state_changed: Optional[callable] = None
        self.on_log: Optional[callable] = None
        
        # 设置Modbus回调
        self._setup_modbus_callbacks()
        self._setup_mqtt_callbacks()
    
    def _setup_modbus_callbacks(self):
        """设置Modbus回调"""
        def on_coil_changed(name: str, value: bool):
            if self.config.mode == 'sim':
                # 仿真模式：线圈变化发布为控制消息
                self._log(f"[控制] {name} = {value}")
                self._publish_sim_control(name, value)
        
        def on_discrete_input_changed(name: str, value: bool):
            if self.config.mode == 'sync':
                # 同步模式：离散输入变化发布为状态消息
                self._log(f"[反馈] {name} = {value}")
                self._publish_sync_feedback(name, value)
        
        self.modbus.on_coil_changed = on_coil_changed
        self.modbus.on_discrete_input_changed = on_discrete_input_changed
    
    def _setup_mqtt_callbacks(self):
        """设置MQTT回调"""
        def on_mqtt_message(message: MqttMessage):
            if self.config.mode == 'sim':
                # 仿真模式：收到反馈消息，写入PLC离散输入
                self._handle_sim_feedback(message)
        
        self.mqtt.on_message = on_mqtt_message
        
        def on_connected():
            self._log("MQTT连接成功")
            if self.config.mode == 'sim':
                # 订阅仿真模式反馈
                self.mqtt.subscribe_sim_feedback(lambda m: None)
        
        self.mqtt.on_connected = on_connected
    
    def _log(self, message: str):
        """记录日志"""
        logger.info(message)
        if self.on_log:
            self.on_log(message)
    
    def _set_state(self, state: GatewayState):
        """设置状态"""
        self.state = state
        if self.on_state_changed:
            self.on_state_changed(state)
    
    def _publish_sim_control(self, name: str, value: bool):
        """发布仿真模式控制消息"""
        if name.startswith('cylinder_'):
            cylinder_name = name.replace('cylinder_', '').replace('_extend', '').replace('_retract', '')
            # 气缸伸出/缩回
            if '_extend' in name:
                self.mqtt.publish_sim_control_cylinder(cylinder_name, True)
            elif '_retract' in name:
                self.mqtt.publish_sim_control_cylinder(cylinder_name, False)
        elif name == 'conveyor_run':
            self.mqtt.publish_sim_control_conveyor(value)
        elif name == 'material_spawn':
            self.mqtt.publish_sim_control_material(value)
    
    def _publish_sync_feedback(self, name: str, value: bool):
        """发布同步模式反馈消息"""
        if name.startswith('sensor_'):
            sensor_name = name.replace('sensor_', '')
            self.mqtt.publish_sync_sensor(sensor_name, value)
        elif name.startswith('magnetic_'):
            magnetic_name = name.replace('magnetic_', '')
            self.mqtt.publish_sync_magnetic(magnetic_name, value)
    
    def _handle_sim_feedback(self, message: MqttMessage):
        """处理仿真模式反馈"""
        payload = message.payload
        msg_type = payload.get('type')
        name = payload.get('name')
        value = payload.get('value')
        
        if msg_type == 'sensor' and name:
            # 写入对应的离散输入
            self._log(f"[反馈写入] sensor_{name} = {value}")
            # 注意：需要PLC支持写入离散输入
            # 这里假设PLC有对应的保持寄存器映射
        
        elif msg_type == 'magnetic' and name:
            self._log(f"[反馈写入] magnetic_{name} = {value}")
    
    def start(self) -> bool:
        """启动网关"""
        if self._running:
            return True
        
        self._set_state(GatewayState.STARTING)
        self._log("正在启动网关...")
        
        # 检查配置
        if not self.config.user_id:
            self._log("错误: 未设置用户ID")
            self._set_state(GatewayState.ERROR)
            return False
        
        # 连接Modbus
        if not self.modbus.connect():
            self._log(f"错误: 无法连接PLC {self.config.modbus.host}:{self.config.modbus.port}")
            self._set_state(GatewayState.ERROR)
            return False
        
        # 连接MQTT
        if not self.mqtt.connect():
            self._log(f"错误: 无法连接MQTT {self.config.mqtt.broker}:{self.config.mqtt.port}")
            self.modbus.disconnect()
            self._set_state(GatewayState.ERROR)
            return False
        
        self._running = True
        self._set_state(GatewayState.RUNNING)
        
        mode_str = "同步模式" if self.config.mode == 'sync' else "仿真模式"
        self._log(f"网关已启动 ({mode_str})")
        
        # 启动主循环
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        
        return True
    
    def stop(self):
        """停止网关"""
        if not self._running:
            return
        
        self._set_state(GatewayState.STOPPING)
        self._log("正在停止网关...")
        
        self._running = False
        
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None
        
        self.modbus.disconnect()
        self.mqtt.disconnect()
        
        self._set_state(GatewayState.STOPPED)
        self._log("网关已停止")
    
    def _run_loop(self):
        """主循环"""
        poll_interval = self.config.poll_interval / 1000.0  # 转换为秒
        
        while self._running:
            try:
                if self.config.mode == 'sync':
                    # 同步模式：读取PLC离散输入，发布到MQTT
                    self.modbus.read_discrete_inputs()
                else:
                    # 仿真模式：读取PLC线圈（控制信号）和离散输入（写入反馈）
                    self.modbus.read_coils()
                    self.modbus.read_discrete_inputs()
                
                time.sleep(poll_interval)
                
            except Exception as e:
                logger.error(f"主循环异常: {e}")
                time.sleep(1)
    
    def update_config(self, config: GatewayConfig):
        """更新配置（需要重启）"""
        was_running = self._running
        
        if was_running:
            self.stop()
        
        self.config = config
        
        # 更新客户端配置
        self.modbus.host = config.modbus.host
        self.modbus.port = config.modbus.port
        self.modbus.unit_id = config.modbus.unit_id
        self.modbus.timeout = config.modbus.timeout
        
        self.mqtt.broker = config.mqtt.broker
        self.mqtt.port = config.mqtt.port
        self.mqtt.use_tls = config.mqtt.use_tls
        self.mqtt.username = config.mqtt.username
        self.mqtt.password = config.mqtt.password
        self.mqtt.user_id = config.user_id
        
        if was_running:
            self.start()
    
    def get_status(self) -> dict:
        """获取状态"""
        return {
            'state': self.state.value,
            'mode': self.config.mode,
            'modbus_connected': self.modbus.is_connected,
            'mqtt_connected': self.mqtt.is_connected,
            'user_id': self.config.user_id,
            'coils': {
                name: self.modbus.get_coil_state(name)
                for name in self.modbus.COIL_ADDRESSES.values()
            },
            'discrete_inputs': {
                name: self.modbus.get_discrete_input_state(name)
                for name in self.modbus.DISCRETE_INPUT_ADDRESSES.values()
            },
        }
