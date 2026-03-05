"""
MQTT客户端模块
"""
import json
import logging
import secrets
from typing import Optional, Callable, Dict, Any
from dataclasses import dataclass
import ssl

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


@dataclass
class MqttMessage:
    """MQTT消息"""
    topic: str
    payload: Dict[str, Any]
    timestamp: int


class MqttClient:
    """MQTT客户端"""
    
    def __init__(
        self,
        broker: str,
        port: int = 8084,
        use_tls: bool = True,
        username: str = "",
        password: str = "",
        keepalive: int = 60,
        user_id: str = "",
    ):
        self.broker = broker
        self.port = port
        self.use_tls = use_tls
        self.username = username
        self.password = password
        self.keepalive = keepalive
        self.user_id = user_id
        
        # 生成随机客户端ID
        self.client_id = f"gateway-{secrets.token_hex(8)}"
        
        self.client: Optional[mqtt.Client] = None
        self._connected = False
        
        # 订阅回调映射
        self._subscriptions: Dict[str, Callable[[MqttMessage], None]] = {}
        
        # 状态回调
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_message: Optional[Callable[[MqttMessage], None]] = None
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    def connect(self) -> bool:
        """连接MQTT Broker"""
        try:
            self.client = mqtt.Client(
                client_id=self.client_id,
                protocol=mqtt.MQTTv311,
                transport="websockets" if self.port in [8083, 8084] else "tcp",
            )
            
            # 设置认证
            if self.username:
                self.client.username_pw_set(self.username, self.password)
            
            # 设置TLS
            if self.use_tls:
                self.client.tls_set(
                    cert_reqs=ssl.CERT_REQUIRED,
                    tls_version=ssl.PROTOCOL_TLS,
                )
            
            # 设置回调
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message
            
            # 连接
            self.client.connect(self.broker, self.port, self.keepalive)
            self.client.loop_start()
            
            logger.info(f"MQTT连接中: {self.broker}:{self.port}")
            return True
            
        except Exception as e:
            logger.error(f"MQTT连接异常: {e}")
            return False
    
    def disconnect(self):
        """断开连接"""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
        self._connected = False
        logger.info("MQTT已断开连接")
    
    def _on_connect(self, client, userdata, flags, rc):
        """连接回调"""
        if rc == 0:
            self._connected = True
            logger.info(f"MQTT连接成功: {self.broker}:{self.port}")
            
            # 重新订阅
            for topic in self._subscriptions:
                self.client.subscribe(topic)
                logger.debug(f"重新订阅: {topic}")
            
            if self.on_connected:
                self.on_connected()
        else:
            logger.error(f"MQTT连接失败: rc={rc}")
    
    def _on_disconnect(self, client, userdata, rc):
        """断开回调"""
        self._connected = False
        logger.warning(f"MQTT断开连接: rc={rc}")
        
        if self.on_disconnected:
            self.on_disconnected()
    
    def _on_message(self, client, userdata, msg):
        """消息回调"""
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode('utf-8'))
            
            message = MqttMessage(
                topic=topic,
                payload=payload,
                timestamp=payload.get('timestamp', 0),
            )
            
            logger.debug(f"收到消息: {topic}")
            
            # 调用特定主题回调
            for sub_topic, callback in self._subscriptions.items():
                if topic.startswith(sub_topic) or topic == sub_topic:
                    callback(message)
            
            # 调用通用消息回调
            if self.on_message:
                self.on_message(message)
                
        except json.JSONDecodeError as e:
            logger.warning(f"消息解析失败: {e}")
        except Exception as e:
            logger.error(f"消息处理异常: {e}")
    
    def subscribe(self, topic: str, callback: Callable[[MqttMessage], None]):
        """订阅主题"""
        self._subscriptions[topic] = callback
        
        if self._connected and self.client:
            self.client.subscribe(topic)
            logger.info(f"订阅主题: {topic}")
    
    def unsubscribe(self, topic: str):
        """取消订阅"""
        if topic in self._subscriptions:
            del self._subscriptions[topic]
        
        if self._connected and self.client:
            self.client.unsubscribe(topic)
            logger.info(f"取消订阅: {topic}")
    
    def publish(self, topic: str, payload: Dict[str, Any], qos: int = 0):
        """发布消息"""
        if not self._connected or not self.client:
            logger.warning(f"MQTT未连接，无法发布: {topic}")
            return False
        
        try:
            message = json.dumps(payload, ensure_ascii=False)
            result = self.client.publish(topic, message, qos=qos)
            
            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                logger.debug(f"发布成功: {topic}")
                return True
            else:
                logger.warning(f"发布失败: {topic}, rc={result.rc}")
                return False
                
        except Exception as e:
            logger.error(f"发布异常: {e}")
            return False
    
    # ============ 同步模式发布方法 ============
    
    def publish_sync_sensor(self, sensor_name: str, value: bool):
        """发布同步模式传感器状态"""
        if not self.user_id:
            logger.warning("未设置user_id")
            return
        
        topic = f"user/{self.user_id}/sync/sensor_{sensor_name}"
        self.publish(topic, {
            'type': 'sensor',
            'name': sensor_name,
            'value': value,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def publish_sync_magnetic(self, magnetic_name: str, value: bool):
        """发布同步模式磁性开关状态"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sync/magnetic_{magnetic_name}"
        self.publish(topic, {
            'type': 'magnetic',
            'name': magnetic_name,
            'value': value,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def publish_sync_cylinder(self, cylinder_name: str, value: bool):
        """发布同步模式气缸状态"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sync/cylinder_{cylinder_name}"
        self.publish(topic, {
            'type': 'cylinder',
            'name': cylinder_name,
            'value': value,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def publish_sync_conveyor(self, running: bool):
        """发布同步模式传送带状态"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sync/conveyor"
        self.publish(topic, {
            'type': 'conveyor',
            'name': 'main',
            'value': running,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    # ============ 仿真模式发布方法 ============
    
    def publish_sim_control_cylinder(self, cylinder_name: str, value: bool):
        """发布仿真模式气缸控制"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sim/control/cylinder_{cylinder_name}"
        self.publish(topic, {
            'type': 'cylinder',
            'name': cylinder_name,
            'value': value,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def publish_sim_control_conveyor(self, running: bool):
        """发布仿真模式传送带控制"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sim/control/conveyor"
        self.publish(topic, {
            'type': 'conveyor',
            'name': 'main',
            'value': running,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def publish_sim_control_material(self, spawn: bool):
        """发布仿真模式物料生成控制"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sim/control/material_spawn"
        self.publish(topic, {
            'type': 'material',
            'name': 'spawn',
            'value': spawn,
            'timestamp': int(__import__('time').time() * 1000),
        })
    
    def subscribe_sim_feedback(self, callback: Callable[[MqttMessage], None]):
        """订阅仿真模式反馈"""
        if not self.user_id:
            return
        
        topic = f"user/{self.user_id}/sim/feedback/#"
        self.subscribe(topic, callback)
