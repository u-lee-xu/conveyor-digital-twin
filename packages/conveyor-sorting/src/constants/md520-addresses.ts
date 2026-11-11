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
