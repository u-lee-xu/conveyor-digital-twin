# 电磁阀类型切换 Spec

## Why
实际气动系统中，电磁阀分为单电控（弹簧复位）和双电控（自保持）两种。当前仿真仅支持双电控模式，无法兼容单电控阀的使用场景。需要在仿真面板上增加切换开关，支持两种模式的实时切换。

## What Changes
- SimPanel 新增"单电控 / 双电控"切换按钮组
- 双电控模式：保持现有逻辑（上升沿触发 + 自锁保持），使用全部6个线圈（每缸2个）
- 单电控模式：仅使用伸出/夹紧线圈，线圈得电→伸出/夹紧，线圈失电→缩回/松开
- 单电控模式下，缩回/松开线圈的 UI 指示灯变灰，表示未使用
- 帮助面板更新使用说明

## Impact
- Affected specs: 无
- Affected code: `SimPanel.tsx`, `HelpPanel.tsx`

## ADDED Requirements

### Requirement: 电磁阀类型切换
仿真面板 SHALL 提供"单电控"和"双电控"两个切换按钮，默认选中"双电控"。

#### Scenario: 切换到单电控模式
- **WHEN** 用户在仿真面板中点击"单电控"按钮
- **THEN** 电磁阀逻辑切换为单电控模式
- **AND** IO 信号区域中缩回/松开线圈的 LED 指示灯变灰（显示"未使用"）

#### Scenario: 切换回双电控模式
- **WHEN** 用户在仿真面板中点击"双电控"按钮
- **THEN** 电磁阀逻辑切换为双电控模式（上升沿触发 + 自锁保持）
- **AND** 所有6个线圈 LED 指示灯恢复正常显示

### Requirement: 单电控 PLC→模型 逻辑
系统 SHALL 在单电控模式下，根据伸出/夹紧线圈的实时电平直接控制气缸位置。

#### Scenario: 伸出线圈得电
- **WHEN** 单电控模式下，SOLENOID_FORWARD_EXTEND 线圈为 ON
- **THEN** 前后气缸立即伸出
- **AND** 忽略 SOLENOID_FORWARD_RETRACT 线圈状态

#### Scenario: 伸出线圈失电
- **WHEN** 单电控模式下，SOLENOID_FORWARD_EXTEND 线圈为 OFF
- **THEN** 前后气缸立即缩回（弹簧复位）

#### Scenario: 夹紧线圈得电
- **WHEN** 单电控模式下，SOLENOID_CLAMP_CLOSE 线圈为 ON
- **THEN** 夹爪立即夹紧
- **AND** 忽略 SOLENOID_CLAMP_OPEN 线圈状态

#### Scenario: 夹紧线圈失电
- **WHEN** 单电控模式下，SOLENOID_CLAMP_CLOSE 线圈为 OFF
- **THEN** 夹爪立即松开

### Requirement: 双电控逻辑保持不变
系统 SHALL 在双电控模式下，保持现有的上升沿触发+自锁保持逻辑不变。

#### Scenario: 双电控伸出脉冲
- **WHEN** 双电控模式下，SOLENOID_FORWARD_EXTEND 从 OFF 变为 ON（上升沿）
- **THEN** 前后气缸伸出并保持
- **AND** 线圈失电后气缸仍保持伸出状态

### Requirement: 单电控 UI 反馈
单电控模式下，IO 信号区域的输出信号 SHALL 将缩回/松开线圈的 LED 显示为灰色，并标注"（未使用）"。

#### Scenario: 单电控输出信号显示
- **WHEN** 处于单电控模式
- **THEN** "水平缩"、"升降缩"、"夹爪松" 三个 LED 指示灯显示为灰色
- **AND** 标注文字变为"水平缩（未使用）"等