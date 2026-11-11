/**
 * MD520 变频器 485 专用参数地址（十进制，与网关 / 虚拟 PLC 同源）。
 *
 * 依据《MD520系列通用变频器通信手册-CN-B03》2.2 参数通信地址、2.3 专用地址表。
 * 十进制书写是为了让 websocket-server/mock-addresses.js --check 的
 * checkSceneAgainstConstants 十进制正则能直接对照，禁止改成十六进制字面量。
 *
 * 与 packages/shared/src/services/modbus-websocket.ts > CONNECT_WORDS 一一对应，
 * 也与 websocket-server/mock-addresses.js > VFD_REGISTERS 一一对应。
 */
export const MD520_HOLDING_REGISTERS = {
  VFD_SETPOINT: 4096,     // 1000H 通信设定值 -10000~10000
  VFD_RUN_FREQ: 4097,     // 1001H 运行频率
  VFD_DI_FLAGS: 4104,     // 1008H DI 输入标志
  VFD_DO_FLAGS: 4105,     // 1009H DO 输出标志
  VFD_AI1: 4106,          // 100AH AI1 电压
  VFD_COMMAND2: 8192,     // 2000H 控制命令2
  VFD_DO_CONTROL: 8193,   // 2001H 数字量输出端子控制
  VFD_AO1: 8194,          // 2002H 模拟输出 AO1
  VFD_STATUS1: 12288,     // 3000H 读取变频器状态1
  VFD_FREQ2: 29456,       // 7310H 通信设定频率2
  VFD_COMMAND1: 29457,    // 7311H 控制命令1
  VFD_STATUS2: 28740,     // 7044H 读取变频器状态2
  VFD_PARAM_F0_02: 61442, // F002H 运行指令选择（面板写 → PLC 读）
  VFD_PARAM_F0_03: 61443, // F003H 主频率指令输入选择（面板写 → PLC 读）
  VFD_PARAM_F0_10: 61450, // F00AH 最大频率（面板写 → PLC 读，0.01Hz）
} as const;

/** 功能码参数通信地址：组号高 8 位 + 组内序号低 8 位（通信手册 2.2） */
export const MD520_PARAM_BASE = {
  F0: 61440,   // F000H
  F4: 61444,   // F400H
  F5: 61445,   // F500H
  F7: 61447,   // F700H
  FD: 61453,   // FD00H
  FP: 61455,   // FP00H
  U0: 57856,   // E000H 监视参数（只读）
} as const;

export type Md520WordName = keyof typeof MD520_HOLDING_REGISTERS;

/**
 * 实体 PLC 镜像字地址：MD520 从站寄存器在 S7 / 三菱程序里的落点。
 * 与 packages/shared/src/services/modbus-websocket.ts > CONNECT_WORDS 的
 * s7 / mitsubishi 字段逐键同源，由 mock-addresses.js --check > checkWordProtocolChain 锁死。
 * S7 用 M 区字 MW1000~MW1014，三菱用 D1000~D1014，均避开配药 D120·D121 与布尔点区。
 */
export const MD520_PROTOCOL_ADDRESSES = {
  VFD_SETPOINT: { s7: 'MW1000', mitsubishi: 'D1000' },
  VFD_RUN_FREQ: { s7: 'MW1001', mitsubishi: 'D1001' },
  VFD_DI_FLAGS: { s7: 'MW1002', mitsubishi: 'D1002' },
  VFD_DO_FLAGS: { s7: 'MW1003', mitsubishi: 'D1003' },
  VFD_AI1: { s7: 'MW1004', mitsubishi: 'D1004' },
  VFD_COMMAND2: { s7: 'MW1005', mitsubishi: 'D1005' },
  VFD_DO_CONTROL: { s7: 'MW1006', mitsubishi: 'D1006' },
  VFD_AO1: { s7: 'MW1007', mitsubishi: 'D1007' },
  VFD_STATUS1: { s7: 'MW1008', mitsubishi: 'D1008' },
  VFD_FREQ2: { s7: 'MW1009', mitsubishi: 'D1009' },
  VFD_COMMAND1: { s7: 'MW1010', mitsubishi: 'D1010' },
  VFD_STATUS2: { s7: 'MW1011', mitsubishi: 'D1011' },
  VFD_PARAM_F0_02: { s7: 'MW1012', mitsubishi: 'D1012' },
  VFD_PARAM_F0_03: { s7: 'MW1013', mitsubishi: 'D1013' },
  VFD_PARAM_F0_10: { s7: 'MW1014', mitsubishi: 'D1014' },
} as const;
