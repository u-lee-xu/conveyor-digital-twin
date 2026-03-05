"""
配置管理模块
"""
import os
import yaml
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path


@dataclass
class ModbusConfig:
    """Modbus配置"""
    host: str = "192.168.1.100"
    port: int = 502
    unit_id: int = 1
    timeout: int = 5


@dataclass
class MqttConfig:
    """MQTT配置"""
    broker: str = "broker.emqx.io"
    port: int = 8084
    use_tls: bool = True
    username: str = ""
    password: str = ""
    keepalive: int = 60


@dataclass
class GatewayConfig:
    """网关配置"""
    mode: str = "sim"  # sync | sim
    poll_interval: int = 100  # ms
    user_id: str = ""
    modbus: ModbusConfig = field(default_factory=ModbusConfig)
    mqtt: MqttConfig = field(default_factory=MqttConfig)


class ConfigManager:
    """配置管理器"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or self._get_default_config_path()
        self.config = self._load_config()
    
    def _get_default_config_path(self) -> str:
        """获取默认配置文件路径"""
        base_dir = Path(__file__).parent.parent
        return str(base_dir / "config" / "default.yaml")
    
    def _load_config(self) -> GatewayConfig:
        """加载配置文件"""
        if os.path.exists(self.config_path):
            with open(self.config_path, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
            return self._parse_config(data)
        return GatewayConfig()
    
    def _parse_config(self, data: dict) -> GatewayConfig:
        """解析配置数据"""
        gateway_data = data.get('gateway', {})
        modbus_data = data.get('modbus', {})
        mqtt_data = data.get('mqtt', {})
        
        modbus_config = ModbusConfig(
            host=modbus_data.get('host', '192.168.1.100'),
            port=modbus_data.get('port', 502),
            unit_id=modbus_data.get('unit_id', 1),
            timeout=modbus_data.get('timeout', 5),
        )
        
        mqtt_config = MqttConfig(
            broker=mqtt_data.get('broker', 'broker.emqx.io'),
            port=mqtt_data.get('port', 8084),
            use_tls=mqtt_data.get('use_tls', True),
            username=mqtt_data.get('username', ''),
            password=mqtt_data.get('password', ''),
            keepalive=mqtt_data.get('keepalive', 60),
        )
        
        return GatewayConfig(
            mode=gateway_data.get('mode', 'sim'),
            poll_interval=gateway_data.get('poll_interval', 100),
            user_id=gateway_data.get('user_id', ''),
            modbus=modbus_config,
            mqtt=mqtt_config,
        )
    
    def save_config(self, config: GatewayConfig, path: Optional[str] = None):
        """保存配置到文件"""
        save_path = path or self.config_path
        
        data = {
            'gateway': {
                'mode': config.mode,
                'poll_interval': config.poll_interval,
                'user_id': config.user_id,
            },
            'modbus': {
                'host': config.modbus.host,
                'port': config.modbus.port,
                'unit_id': config.modbus.unit_id,
                'timeout': config.modbus.timeout,
            },
            'mqtt': {
                'broker': config.mqtt.broker,
                'port': config.mqtt.port,
                'use_tls': config.mqtt.use_tls,
                'username': config.mqtt.username,
                'password': config.mqtt.password,
                'keepalive': config.mqtt.keepalive,
            },
            'logging': {
                'level': 'INFO',
                'file': 'gateway.log',
                'max_size': 10485760,
                'backup_count': 5,
            }
        }
        
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, 'w', encoding='utf-8') as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False)
        
        self.config = config
    
    def update_config(self, **kwargs):
        """更新配置"""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)
