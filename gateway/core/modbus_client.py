"""
ModbusTCP客户端模块
"""
import logging
from typing import Optional, List, Callable
from dataclasses import dataclass

from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

logger = logging.getLogger(__name__)


@dataclass
class CoilState:
    """线圈状态"""
    address: int
    name: str
    value: bool


@dataclass
class DiscreteInputState:
    """离散输入状态"""
    address: int
    name: str
    value: bool


class ModbusClient:
    """ModbusTCP客户端"""
    
    # 线圈地址定义（控制信号）
    COIL_ADDRESSES = {
        0: 'cylinder_feed_extend',      # 上料气缸伸出
        1: 'cylinder_feed_retract',     # 上料气缸缩回
        2: 'cylinder_sorting1_extend',  # 分拣1气缸伸出
        3: 'cylinder_sorting1_retract', # 分拣1气缸缩回
        4: 'cylinder_sorting2_extend',  # 分拣2气缸伸出
        5: 'cylinder_sorting2_retract', # 分拣2气缸缩回
        6: 'conveyor_run',              # 传送带运行
        7: 'material_spawn',            # 物料生成
    }
    
    # 离散输入地址定义（反馈信号）
    DISCRETE_INPUT_ADDRESSES = {
        0: 'sensor_feed',                 # 上料传感器
        1: 'sensor_color',                # 色标传感器
        2: 'sensor_material',             # 物料传感器
        3: 'magnetic_feed_extend',        # 上料气缸伸出限位
        4: 'magnetic_feed_retract',       # 上料气缸缩回限位
        5: 'magnetic_sorting1_extend',    # 分拣1气缸伸出限位
        6: 'magnetic_sorting1_retract',   # 分拣1气缸缩回限位
        7: 'magnetic_sorting2_extend',    # 分拣2气缸伸出限位
        8: 'magnetic_sorting2_retract',   # 分拣2气缸缩回限位
    }
    
    def __init__(self, host: str, port: int = 502, unit_id: int = 1, timeout: int = 5):
        self.host = host
        self.port = port
        self.unit_id = unit_id
        self.timeout = timeout
        self.client: Optional[ModbusTcpClient] = None
        self._connected = False
        
        # 状态缓存（用于检测变化）
        self._last_coils: List[bool] = [False] * 8
        self._last_discrete_inputs: List[bool] = [False] * 9
        
        # 回调函数
        self.on_coil_changed: Optional[Callable[[str, bool], None]] = None
        self.on_discrete_input_changed: Optional[Callable[[str, bool], None]] = None
    
    @property
    def is_connected(self) -> bool:
        return self._connected
    
    def connect(self) -> bool:
        """连接到PLC"""
        try:
            self.client = ModbusTcpClient(
                host=self.host,
                port=self.port,
                timeout=self.timeout,
            )
            self._connected = self.client.connect()
            if self._connected:
                logger.info(f"ModbusTCP连接成功: {self.host}:{self.port}")
                # 初始化状态缓存
                self._read_all_states()
            else:
                logger.error(f"ModbusTCP连接失败: {self.host}:{self.port}")
            return self._connected
        except Exception as e:
            logger.error(f"ModbusTCP连接异常: {e}")
            self._connected = False
            return False
    
    def disconnect(self):
        """断开连接"""
        if self.client:
            self.client.close()
            self.client = None
        self._connected = False
        logger.info("ModbusTCP已断开连接")
    
    def _read_all_states(self):
        """读取所有状态（初始化缓存）"""
        if not self._connected or not self.client:
            return
        
        try:
            # 读取线圈
            result = self.client.read_coils(address=0, count=8, slave=self.unit_id)
            if not result.isError():
                self._last_coils = list(result.bits[:8])
            
            # 读取离散输入
            result = self.client.read_discrete_inputs(address=0, count=9, slave=self.unit_id)
            if not result.isError():
                self._last_discrete_inputs = list(result.bits[:9])
        except Exception as e:
            logger.error(f"读取状态失败: {e}")
    
    def read_coils(self) -> List[CoilState]:
        """读取所有线圈状态"""
        if not self._connected or not self.client:
            return []
        
        states = []
        try:
            result = self.client.read_coils(address=0, count=8, slave=self.unit_id)
            if result.isError():
                logger.warning(f"读取线圈失败: {result}")
                return []
            
            current_values = list(result.bits[:8])
            
            for addr, name in self.COIL_ADDRESSES.items():
                value = current_values[addr]
                states.append(CoilState(address=addr, name=name, value=value))
                
                # 检测变化
                if value != self._last_coils[addr]:
                    logger.debug(f"线圈变化: {name} = {value}")
                    if self.on_coil_changed:
                        self.on_coil_changed(name, value)
            
            self._last_coils = current_values
            
        except Exception as e:
            logger.error(f"读取线圈异常: {e}")
        
        return states
    
    def read_discrete_inputs(self) -> List[DiscreteInputState]:
        """读取所有离散输入状态"""
        if not self._connected or not self.client:
            return []
        
        states = []
        try:
            result = self.client.read_discrete_inputs(address=0, count=9, slave=self.unit_id)
            if result.isError():
                logger.warning(f"读取离散输入失败: {result}")
                return []
            
            current_values = list(result.bits[:9])
            
            for addr, name in self.DISCRETE_INPUT_ADDRESSES.items():
                value = current_values[addr]
                states.append(DiscreteInputState(address=addr, name=name, value=value))
                
                # 检测变化
                if value != self._last_discrete_inputs[addr]:
                    logger.debug(f"离散输入变化: {name} = {value}")
                    if self.on_discrete_input_changed:
                        self.on_discrete_input_changed(name, value)
            
            self._last_discrete_inputs = current_values
            
        except Exception as e:
            logger.error(f"读取离散输入异常: {e}")
        
        return states
    
    def write_coil(self, address: int, value: bool) -> bool:
        """写入单个线圈"""
        if not self._connected or not self.client:
            return False
        
        try:
            result = self.client.write_coil(address=address, value=value, slave=self.unit_id)
            if result.isError():
                logger.warning(f"写入线圈失败: address={address}, value={value}")
                return False
            logger.debug(f"写入线圈成功: address={address}, value={value}")
            return True
        except Exception as e:
            logger.error(f"写入线圈异常: {e}")
            return False
    
    def write_coil_by_name(self, name: str, value: bool) -> bool:
        """通过名称写入线圈"""
        address = None
        for addr, n in self.COIL_ADDRESSES.items():
            if n == name:
                address = addr
                break
        
        if address is None:
            logger.warning(f"未找到线圈: {name}")
            return False
        
        return self.write_coil(address, value)
    
    def write_discrete_input(self, address: int, value: bool) -> bool:
        """写入离散输入（仿真模式，需要PLC支持）"""
        # 注意：标准Modbus不支持写入离散输入
        # 这里假设PLC有对应的保持寄存器映射
        # 实际实现需要根据PLC配置调整
        logger.warning(f"写入离散输入: address={address}, value={value} (需要PLC支持)")
        return False
    
    def get_coil_state(self, name: str) -> Optional[bool]:
        """获取指定线圈的当前状态"""
        for addr, n in self.COIL_ADDRESSES.items():
            if n == name:
                return self._last_coils[addr]
        return None
    
    def get_discrete_input_state(self, name: str) -> Optional[bool]:
        """获取指定离散输入的当前状态"""
        for addr, n in self.DISCRETE_INPUT_ADDRESSES.items():
            if n == name:
                return self._last_discrete_inputs[addr]
        return None
