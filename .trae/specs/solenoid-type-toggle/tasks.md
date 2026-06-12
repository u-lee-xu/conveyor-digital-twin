# Tasks

- [x] Task 1: 在 SimPanel 添加电磁阀类型切换按钮组
  - [x] 添加 `solenoidType` state（'single' | 'double'，默认 'double'）
  - [x] 在"控制按钮"卡片中添加"单电控/双电控"切换按钮组
  - [x] 确保切换时不需要断开 PLC 连接

- [x] Task 2: 实现单电控模式下的 PLC→模型 逻辑
  - [x] 在轮询循环中分支：单电控使用直接电平控制，双电控保持上升沿逻辑
  - [x] 单电控：SOLENOID_X_EXTEND/CLAMP_CLOSE 为 ON→伸出/夹紧，OFF→缩回/松开
  - [x] 单电控：忽略缩回/松开线圈，不使用 prevSol 状态
  - [x] 夹爪逻辑：SOLENOID_CLAMP_CLOSE=ON→夹紧(extended=false)，OFF→松开(extended=true)

- [x] Task 3: 单电控模式下 IO 信号 LED 变化
  - [x] 单电控模式下，"水平缩"、"升降缩"、"夹爪松" 三个 LED 变灰
  - [x] 标签文字加上"（未使用）"后缀

- [x] Task 4: 更新帮助面板说明
  - [x] 在"使用说明"tab 中添加单电控/双电控的使用说明
  - [x] 说明单电控模式下仅使用伸出/夹紧线圈

# Task Dependencies
- Task 2 依赖 Task 1（需要 solenoidType 状态）
- Task 3 可与 Task 2 并行
- Task 4 独立，可与其他任务并行