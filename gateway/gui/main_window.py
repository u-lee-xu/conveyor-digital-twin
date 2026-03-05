"""
主窗口模块
"""
import sys
import logging
from typing import Optional
from datetime import datetime

from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QGroupBox, QLabel, QPushButton, QLineEdit, QComboBox, QSpinBox,
    QTextEdit, QTabWidget, QFormLayout, QCheckBox, QMessageBox,
    QStatusBar, QFrame, QGridLayout, QScrollArea,
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QFont, QColor, QPalette

# 添加父目录到路径
sys.path.insert(0, str(__file__).rsplit('/gateway', 1)[0])

from config import ConfigManager, GatewayConfig
from core import Gateway, GatewayState


class StatusIndicator(QFrame):
    """状态指示器"""
    
    def __init__(self, label: str):
        super().__init__()
        self.setFixedSize(120, 50)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        
        self.label = QLabel(label)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet("font-size: 11px; color: #888;")
        
        self.indicator = QLabel()
        self.indicator.setFixedSize(16, 16)
        self.indicator.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        indicator_layout = QHBoxLayout()
        indicator_layout.addStretch()
        indicator_layout.addWidget(self.indicator)
        indicator_layout.addStretch()
        
        layout.addLayout(indicator_layout)
        layout.addWidget(self.label)
        
        self.set_connected(False)
    
    def set_connected(self, connected: bool):
        self.connected = connected
        if connected:
            self.indicator.setStyleSheet("""
                background-color: #22c55e;
                border-radius: 8px;
            """)
        else:
            self.indicator.setStyleSheet("""
                background-color: #6b7280;
                border-radius: 8px;
            """)


class SignalIndicator(QFrame):
    """信号指示器"""
    
    def __init__(self, name: str):
        super().__init__()
        self.setFixedSize(80, 60)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        
        self.indicator = QLabel()
        self.indicator.setFixedSize(20, 20)
        self.indicator.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        indicator_layout = QHBoxLayout()
        indicator_layout.addStretch()
        indicator_layout.addWidget(self.indicator)
        indicator_layout.addStretch()
        
        self.label = QLabel(name)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setStyleSheet("font-size: 10px; color: #888;")
        
        layout.addLayout(indicator_layout)
        layout.addWidget(self.label)
        
        self.set_value(False)
    
    def set_value(self, value: bool):
        self.value = value
        if value:
            self.indicator.setStyleSheet("""
                background-color: #22c55e;
                border-radius: 10px;
            """)
        else:
            self.indicator.setStyleSheet("""
                background-color: #374151;
                border-radius: 10px;
            """)


class MainWindow(QMainWindow):
    """主窗口"""
    
    def __init__(self):
        super().__init__()
        
        self.config_manager = ConfigManager()
        self.gateway: Optional[Gateway] = None
        
        self._init_ui()
        self._load_config()
        
        # 定时器更新状态
        self.status_timer = QTimer()
        self.status_timer.timeout.connect(self._update_status)
        self.status_timer.start(200)  # 200ms更新一次
    
    def _init_ui(self):
        """初始化UI"""
        self.setWindowTitle("数字孪生网关 v1.0")
        self.setMinimumSize(900, 700)
        self.setStyleSheet("""
            QMainWindow {
                background-color: #1a1a2e;
            }
            QWidget {
                color: #e0e0e0;
                font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
            }
            QGroupBox {
                font-weight: bold;
                border: 1px solid #3a3a5a;
                border-radius: 5px;
                margin-top: 10px;
                padding-top: 10px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 10px;
                padding: 0 5px;
            }
            QLineEdit, QSpinBox, QComboBox {
                background-color: #2a2a4a;
                border: 1px solid #3a3a5a;
                border-radius: 3px;
                padding: 5px;
                color: #e0e0e0;
            }
            QPushButton {
                background-color: #3a3a5a;
                border: none;
                border-radius: 5px;
                padding: 8px 15px;
                color: #e0e0e0;
            }
            QPushButton:hover {
                background-color: #4a4a6a;
            }
            QPushButton:pressed {
                background-color: #5a5a7a;
            }
            QTextEdit {
                background-color: #0a0a1a;
                border: 1px solid #3a3a5a;
                border-radius: 3px;
                font-family: "Consolas", "Courier New", monospace;
                font-size: 12px;
            }
        """)
        
        # 创建中心部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(10, 10, 10, 10)
        main_layout.setSpacing(10)
        
        # 顶部状态栏
        self._create_status_bar(main_layout)
        
        # 主内容区域
        content_layout = QHBoxLayout()
        main_layout.addLayout(content_layout, 1)
        
        # 左侧：控制面板
        self._create_control_panel(content_layout)
        
        # 右侧：信号监控
        self._create_signal_panel(content_layout)
        
        # 底部：日志
        self._create_log_panel(main_layout)
        
        # 状态栏
        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("就绪")
    
    def _create_status_bar(self, layout: QVBoxLayout):
        """创建状态栏"""
        status_frame = QFrame()
        status_frame.setStyleSheet("""
            QFrame {
                background-color: #2a2a4a;
                border-radius: 5px;
            }
        """)
        
        status_layout = QHBoxLayout(status_frame)
        status_layout.setContentsMargins(15, 10, 15, 10)
        
        # Modbus状态
        self.modbus_indicator = StatusIndicator("ModbusTCP")
        status_layout.addWidget(self.modbus_indicator)
        
        # MQTT状态
        self.mqtt_indicator = StatusIndicator("MQTT")
        status_layout.addWidget(self.mqtt_indicator)
        
        # 工作模式
        self.mode_indicator = StatusIndicator("工作模式")
        status_layout.addWidget(self.mode_indicator)
        
        status_layout.addStretch()
        
        # 状态标签
        self.state_label = QLabel("已停止")
        self.state_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #6b7280;")
        status_layout.addWidget(self.state_label)
        
        layout.addWidget(status_frame)
    
    def _create_control_panel(self, layout: QHBoxLayout):
        """创建控制面板"""
        control_frame = QFrame()
        control_frame.setMinimumWidth(350)
        control_frame.setMaximumWidth(400)
        
        control_layout = QVBoxLayout(control_frame)
        control_layout.setContentsMargins(0, 0, 0, 0)
        
        # 连接配置
        config_group = QGroupBox("连接配置")
        config_layout = QFormLayout(config_group)
        
        # PLC配置
        self.plc_host_edit = QLineEdit()
        self.plc_host_edit.setPlaceholderText("192.168.1.100")
        config_layout.addRow("PLC地址:", self.plc_host_edit)
        
        self.plc_port_spin = QSpinBox()
        self.plc_port_spin.setRange(1, 65535)
        self.plc_port_spin.setValue(502)
        config_layout.addRow("PLC端口:", self.plc_port_spin)
        
        # MQTT配置
        self.mqtt_broker_edit = QLineEdit()
        self.mqtt_broker_edit.setPlaceholderText("broker.emqx.io")
        config_layout.addRow("MQTT服务器:", self.mqtt_broker_edit)
        
        self.mqtt_port_spin = QSpinBox()
        self.mqtt_port_spin.setRange(1, 65535)
        self.mqtt_port_spin.setValue(8084)
        config_layout.addRow("MQTT端口:", self.mqtt_port_spin)
        
        self.mqtt_tls_check = QCheckBox("使用TLS")
        self.mqtt_tls_check.setChecked(True)
        config_layout.addRow("", self.mqtt_tls_check)
        
        # 用户配置
        self.user_id_edit = QLineEdit()
        self.user_id_edit.setPlaceholderText("从平台获取用户ID")
        config_layout.addRow("用户ID:", self.user_id_edit)
        
        # 工作模式
        self.mode_combo = QComboBox()
        self.mode_combo.addItems(["仿真模式", "同步模式"])
        config_layout.addRow("工作模式:", self.mode_combo)
        
        control_layout.addWidget(config_group)
        
        # 控制按钮
        btn_layout = QHBoxLayout()
        
        self.start_btn = QPushButton("启动")
        self.start_btn.setStyleSheet("""
            QPushButton {
                background-color: #22c55e;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #16a34a;
            }
        """)
        self.start_btn.clicked.connect(self._on_start)
        btn_layout.addWidget(self.start_btn)
        
        self.stop_btn = QPushButton("停止")
        self.stop_btn.setEnabled(False)
        self.stop_btn.setStyleSheet("""
            QPushButton {
                background-color: #ef4444;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #dc2626;
            }
        """)
        self.stop_btn.clicked.connect(self._on_stop)
        btn_layout.addWidget(self.stop_btn)
        
        control_layout.addLayout(btn_layout)
        
        # 保存配置按钮
        self.save_btn = QPushButton("保存配置")
        self.save_btn.clicked.connect(self._on_save_config)
        control_layout.addWidget(self.save_btn)
        
        control_layout.addStretch()
        
        layout.addWidget(control_frame)
    
    def _create_signal_panel(self, layout: QHBoxLayout):
        """创建信号面板"""
        signal_frame = QFrame()
        signal_layout = QVBoxLayout(signal_frame)
        signal_layout.setContentsMargins(0, 0, 0, 0)
        
        # 控制信号
        control_group = QGroupBox("控制信号 (PLC → 数字孪生)")
        control_grid = QGridLayout(control_group)
        control_grid.setSpacing(5)
        
        self.control_indicators = {}
        control_signals = [
            ('cylinder_feed', '上料气缸'),
            ('cylinder_sorting1', '分拣1气缸'),
            ('cylinder_sorting2', '分拣2气缸'),
            ('conveyor_run', '传送带'),
            ('material_spawn', '物料生成'),
        ]
        
        for i, (name, label) in enumerate(control_signals):
            indicator = SignalIndicator(label)
            self.control_indicators[name] = indicator
            control_grid.addWidget(indicator, i // 5, i % 5)
        
        signal_layout.addWidget(control_group)
        
        # 反馈信号
        feedback_group = QGroupBox("反馈信号 (数字孪生 → PLC)")
        feedback_grid = QGridLayout(feedback_group)
        feedback_grid.setSpacing(5)
        
        self.feedback_indicators = {}
        feedback_signals = [
            ('sensor_feed', '上料传感器'),
            ('sensor_color', '色标传感器'),
            ('sensor_material', '物料传感器'),
            ('magnetic_feed', '上料磁开'),
            ('magnetic_sorting1', '分拣1磁开'),
            ('magnetic_sorting2', '分拣2磁开'),
        ]
        
        for i, (name, label) in enumerate(feedback_signals):
            indicator = SignalIndicator(label)
            self.feedback_indicators[name] = indicator
            feedback_grid.addWidget(indicator, i // 6, i % 6)
        
        signal_layout.addWidget(feedback_group)
        signal_layout.addStretch()
        
        layout.addWidget(signal_frame, 1)
    
    def _create_log_panel(self, layout: QVBoxLayout):
        """创建日志面板"""
        log_group = QGroupBox("运行日志")
        log_layout = QVBoxLayout(log_group)
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMaximumHeight(150)
        log_layout.addWidget(self.log_text)
        
        # 日志按钮
        log_btn_layout = QHBoxLayout()
        
        clear_btn = QPushButton("清空日志")
        clear_btn.clicked.connect(self.log_text.clear)
        log_btn_layout.addWidget(clear_btn)
        
        log_btn_layout.addStretch()
        
        log_layout.addLayout(log_btn_layout)
        
        layout.addWidget(log_group)
    
    def _load_config(self):
        """加载配置"""
        config = self.config_manager.config
        
        self.plc_host_edit.setText(config.modbus.host)
        self.plc_port_spin.setValue(config.modbus.port)
        self.mqtt_broker_edit.setText(config.mqtt.broker)
        self.mqtt_port_spin.setValue(config.mqtt.port)
        self.mqtt_tls_check.setChecked(config.mqtt.use_tls)
        self.user_id_edit.setText(config.user_id)
        
        if config.mode == 'sync':
            self.mode_combo.setCurrentIndex(1)
        else:
            self.mode_combo.setCurrentIndex(0)
    
    def _get_current_config(self) -> GatewayConfig:
        """获取当前配置"""
        config = self.config_manager.config
        
        config.modbus.host = self.plc_host_edit.text()
        config.modbus.port = self.plc_port_spin.value()
        config.mqtt.broker = self.mqtt_broker_edit.text()
        config.mqtt.port = self.mqtt_port_spin.value()
        config.mqtt.use_tls = self.mqtt_tls_check.isChecked()
        config.user_id = self.user_id_edit.text()
        config.mode = 'sync' if self.mode_combo.currentIndex() == 1 else 'sim'
        
        return config
    
    def _on_start(self):
        """启动网关"""
        config = self._get_current_config()
        
        if not config.user_id:
            QMessageBox.warning(self, "警告", "请输入用户ID")
            return
        
        if not config.modbus.host:
            QMessageBox.warning(self, "警告", "请输入PLC地址")
            return
        
        if not config.mqtt.broker:
            QMessageBox.warning(self, "警告", "请输入MQTT服务器地址")
            return
        
        # 创建网关
        self.gateway = Gateway(config)
        self.gateway.on_log = self._add_log
        self.gateway.on_state_changed = self._on_state_changed
        
        # 启动
        if self.gateway.start():
            self.start_btn.setEnabled(False)
            self.stop_btn.setEnabled(True)
            self._set_inputs_enabled(False)
        else:
            QMessageBox.critical(self, "错误", "网关启动失败，请检查配置")
    
    def _on_stop(self):
        """停止网关"""
        if self.gateway:
            self.gateway.stop()
            self.gateway = None
        
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self._set_inputs_enabled(True)
    
    def _on_save_config(self):
        """保存配置"""
        config = self._get_current_config()
        self.config_manager.save_config(config)
        self._add_log("配置已保存")
        QMessageBox.information(self, "成功", "配置已保存")
    
    def _set_inputs_enabled(self, enabled: bool):
        """设置输入框可用状态"""
        self.plc_host_edit.setEnabled(enabled)
        self.plc_port_spin.setEnabled(enabled)
        self.mqtt_broker_edit.setEnabled(enabled)
        self.mqtt_port_spin.setEnabled(enabled)
        self.mqtt_tls_check.setEnabled(enabled)
        self.user_id_edit.setEnabled(enabled)
        self.mode_combo.setEnabled(enabled)
    
    def _on_state_changed(self, state: GatewayState):
        """状态变化回调"""
        if state == GatewayState.RUNNING:
            self.state_label.setText("运行中")
            self.state_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #22c55e;")
        elif state == GatewayState.STOPPED:
            self.state_label.setText("已停止")
            self.state_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #6b7280;")
        elif state == GatewayState.ERROR:
            self.state_label.setText("错误")
            self.state_label.setStyleSheet("font-size: 14px; font-weight: bold; color: #ef4444;")
    
    def _add_log(self, message: str):
        """添加日志"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.append(f"[{timestamp}] {message}")
    
    def _update_status(self):
        """更新状态显示"""
        if not self.gateway:
            self.modbus_indicator.set_connected(False)
            self.mqtt_indicator.set_connected(False)
            self.mode_indicator.set_connected(False)
            return
        
        status = self.gateway.get_status()
        
        self.modbus_indicator.set_connected(status['modbus_connected'])
        self.mqtt_indicator.set_connected(status['mqtt_connected'])
        self.mode_indicator.set_connected(status['state'] == 'running')
        
        # 更新信号指示器
        coils = status.get('coils', {})
        for name, value in coils.items():
            short_name = name.replace('cylinder_', '').replace('conveyor_', '').replace('material_', '')
            if short_name in self.control_indicators and value is not None:
                self.control_indicators[short_name].set_value(value)
        
        discrete_inputs = status.get('discrete_inputs', {})
        for name, value in discrete_inputs.items():
            short_name = name.replace('sensor_', '').replace('magnetic_', '')
            if short_name in self.feedback_indicators and value is not None:
                self.feedback_indicators[short_name].set_value(value)
    
    def closeEvent(self, event):
        """关闭事件"""
        if self.gateway and self.gateway.state == GatewayState.RUNNING:
            reply = QMessageBox.question(
                self, "确认退出",
                "网关正在运行，确定要退出吗？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                self.gateway.stop()
                event.accept()
            else:
                event.ignore()
        else:
            event.accept()


def main():
    """主函数"""
    app = QApplication(sys.argv)
    
    # 设置应用样式
    app.setStyle('Fusion')
    
    # 创建主窗口
    window = MainWindow()
    window.show()
    
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
