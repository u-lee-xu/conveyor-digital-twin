/**
 * 汇川 MD520 系列通用变频器 —— 虚拟面板的口径单一来源。
 *
 * 依据（用户提供的 5 本手册 + 5 张资料图）：
 *  - 08 用户手册 CN-B04：16.1 LED 面板、16.3 三级菜单、16.6 故障显示、30 章参数、35.2 故障码
 *  - 10 通信手册 CN-B03：2.2 参数通信地址、2.3 专用地址表、4.5 FD 组
 *  - 07 功能手册 CN-B05：2.1 运行指令 / DIDO 应用
 *  - 11 快速入门 CN-B03：表 4-2 按键、表 4-3 指示灯
 *  - 图 3-9 控制回路端子分布图 / 标准接线图 / 图 4-3 面板部件图
 *
 * 教学子集：按手册功能码顺序收录有默认值依据的功能码，不假装是全量表。
 * F0-01 依据 08 用户手册 17.2.9「设置控制模式」；17.1.1 调试流程第 7 步即 F0-01、
 * 第 9 步才是 F0-02，故 F0 组必须从 F0-01 起翻。
 * FP-01 依据 302 页 17.2.3「参数初始化」：默认 0，六档 0/1/2/4/501/503，停机更改。
 * F1-00~F1-05 依据 303 页 17.2.5「电机参数设置」与表 16-8，均为停机更改。
 * 306 页起：17.2.7 命令源 F0-02、17.2.8 频率源 F0-03（主频率源X，0~9 十档）、
 * 17.2.9 控制模式 F0-01、17.2.13 加减速 F0-17/18/25、17.2.17 停机参数 F6-10~14、
 * 17.2.20 DI 设置 F4-00、17.2.21 DO 设置 F5-04、17.2.22 多段速 FC-00~FC-07（百分比）。
 * 09 参数手册（全量表）多次抽取返回 127，尚未收录；未收录的码不得凭猜测补默认值。
 * 数值一律十进制书写，便于 websocket-server/mock-addresses.js --check 对照。
 */

export interface Md520Param {
  code: string;
  group: string;
  index: number;
  name: string;
  defaultValue: number;
  min: number;
  max: number;
  decimals: number;
  unit: string;
  /** 枚举档位说明，仅用于读数显示，不写进 UI 正文 */
  options?: Record<number, string>;
  readOnly?: boolean;
  /** 运行中不可更改，三级菜单无闪烁位 */
  runLocked?: boolean;
}

/**
 * FC-00~FC-07 多段指令 1~8（17.2.22）：单位是「相对 F0-10 最大频率的百分比」，
 * 不是 Hz。默认值按既有 8 段教学演示频率（MD520_MULTI_SPEED）在默认 50Hz 下换算，
 * 保证面板「段N xxHz」读数与 PLC 参考程序段速表严格一致。
 */
export const MD520_FC_DEFAULT_PERCENT = [0, 20, 40, 60, 80, 100, 70, 50] as const;

/**
 * DI 端子功能码（功能手册 1.1.1.3 / 17.2.20）。F4-00~F4-04 共用这一张档位表，
 * 端子的角色由参数决定，不再写死 DI4 使能 / DI1~DI3 选段。
 */
export const MD520_DI_FUNCTION = {
  NONE: 0, FWD: 1, REV: 2, THREE_WIRE: 3, FJOG: 4, RJOG: 5,
  FREE_STOP: 8, FAULT_RESET: 9,
  MULTI1: 12, MULTI2: 13, MULTI3: 14, MULTI4: 15,
} as const;

export const MD520_DI_FUNCTION_OPTIONS: Record<number, string> = {
  0: '无功能', 1: '正转运行', 2: '反转运行', 3: '三线式运行控制', 4: '正转点动', 5: '反转点动',
  8: '自由停机', 9: '故障复位', 12: '多段指令端子1', 13: '多段指令端子2',
  14: '多段指令端子3', 15: '多段指令端子4',
};

/** 教学子集只覆盖五种控制方式：面板 / 端子开关量 / 多段速 / AI 模拟量 / Modbus 通信。 */
export const MD520_PARAMS: Md520Param[] = [
  { code: 'F0-02', group: 'F0', index: 2, name: '运行指令选择', defaultValue: 0, min: 0, max: 3, decimals: 0, unit: '',
    options: { 0: '操作面板', 1: '端子', 2: '通信', 3: '自定义' } },
  /** 306~307 页 17.2.8：名称「主频率源X选择」，0~9 十档，其他为 F 连接器（非数值档位） */
  { code: 'F0-03', group: 'F0', index: 3, name: '主频率源X选择', defaultValue: 0, min: 0, max: 9, decimals: 0, unit: '',
    options: { 0: '数字设定(掉电不记忆)', 1: '数字设定(掉电记忆)', 2: 'AI1', 3: 'AI2', 4: 'AI3',
      5: 'PULSE脉冲设定(DI5)', 6: '多段指令', 7: '简易PLC', 8: 'PID', 9: '通信给定' } },
  { code: 'F0-08', group: 'F0', index: 8, name: '预置频率', defaultValue: 50, min: 0, max: 599, decimals: 2, unit: 'Hz', runLocked: true },
  { code: 'F0-10', group: 'F0', index: 10, name: '最大频率', defaultValue: 50, min: 50, max: 599, decimals: 2, unit: 'Hz', runLocked: true },
  { code: 'F0-17', group: 'F0', index: 17, name: '加速时间1', defaultValue: 20, min: 0, max: 6500, decimals: 1, unit: 's' },
  { code: 'F0-18', group: 'F0', index: 18, name: '减速时间1', defaultValue: 20, min: 0, max: 6500, decimals: 1, unit: 's' },
  /** 320 页 17.2.20：DI1~DI5 功能选择，档位取自同一张 MD520_DI_FUNCTION_OPTIONS 表 */
  { code: 'F4-00', group: 'F4', index: 0, name: 'DI1端子功能选择', defaultValue: 1, min: 0, max: 86, decimals: 0, unit: '',
    options: MD520_DI_FUNCTION_OPTIONS },
  { code: 'F4-01', group: 'F4', index: 1, name: 'DI2端子功能选择', defaultValue: 2, min: 0, max: 86, decimals: 0, unit: '',
    options: MD520_DI_FUNCTION_OPTIONS },
  { code: 'F4-02', group: 'F4', index: 2, name: 'DI3端子功能选择', defaultValue: 0, min: 0, max: 86, decimals: 0, unit: '',
    options: MD520_DI_FUNCTION_OPTIONS },
  { code: 'F4-03', group: 'F4', index: 3, name: 'DI4端子功能选择', defaultValue: 0, min: 0, max: 86, decimals: 0, unit: '',
    options: MD520_DI_FUNCTION_OPTIONS },
  { code: 'F4-04', group: 'F4', index: 4, name: 'DI5端子功能选择', defaultValue: 0, min: 0, max: 86, decimals: 0, unit: '',
    options: MD520_DI_FUNCTION_OPTIONS },
  { code: 'F4-11', group: 'F4', index: 11, name: '端子命令方式', defaultValue: 0, min: 0, max: 3, decimals: 0, unit: '',
    options: { 0: '两线式1', 1: '两线式2', 2: '三线式1', 3: '三线式2' } },
  /** 331 页 17.2.22：FC-00~FC-15 共 16 段，教学子集取前 8 段。
   *  单位 %（相对 F0-10），100% = F0-10；段位来自配成「多段指令端子1~4」的 DI，不再写死 DI1~DI3。 */
  { code: 'FC-00', group: 'FC', index: 0, name: '多段指令1', defaultValue: MD520_FC_DEFAULT_PERCENT[0], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-01', group: 'FC', index: 1, name: '多段指令2', defaultValue: MD520_FC_DEFAULT_PERCENT[1], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-02', group: 'FC', index: 2, name: '多段指令3', defaultValue: MD520_FC_DEFAULT_PERCENT[2], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-03', group: 'FC', index: 3, name: '多段指令4', defaultValue: MD520_FC_DEFAULT_PERCENT[3], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-04', group: 'FC', index: 4, name: '多段指令5', defaultValue: MD520_FC_DEFAULT_PERCENT[4], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-05', group: 'FC', index: 5, name: '多段指令6', defaultValue: MD520_FC_DEFAULT_PERCENT[5], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-06', group: 'FC', index: 6, name: '多段指令7', defaultValue: MD520_FC_DEFAULT_PERCENT[6], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FC-07', group: 'FC', index: 7, name: '多段指令8', defaultValue: MD520_FC_DEFAULT_PERCENT[7], min: -100, max: 100, decimals: 1, unit: '%' },
  { code: 'FD-00', group: 'FD', index: 0, name: '波特率', defaultValue: 5005, min: 0, max: 6999, decimals: 0, unit: '' },
  { code: 'FD-01', group: 'FD', index: 1, name: 'Modbus数据格式', defaultValue: 0, min: 0, max: 7, decimals: 0, unit: '' },
  { code: 'FD-02', group: 'FD', index: 2, name: '本机地址', defaultValue: 1, min: 1, max: 247, decimals: 0, unit: '' },
  { code: 'U0-00', group: 'U0', index: 0, name: '运行频率', defaultValue: 0, min: 0, max: 655.35, decimals: 2, unit: 'Hz', readOnly: true },
];

export const MD520_PARAM_MAP: Record<string, Md520Param> = Object.fromEntries(
  MD520_PARAMS.map((p) => [p.code, p]),
);

export const MD520_GROUPS = Array.from(new Set(MD520_PARAMS.map((p) => p.group)));

/** 参数通信地址：高 8 位 = 功能组编号，低 8 位 = 组内序号（通信手册 2.2） */
export function groupHex(group: string): number {
  /** FP 组参数通信地址高 8 位是 0x1F（手册 30 章 FP-01 = 0x1F01），第二位不是十六进制数字 */
  if (group === 'FP') return 0x1f;
  const n = Number.parseInt(group.replace(/^[A-Z]/, ''), 16);
  const prefix = group.charCodeAt(0) - 'A'.charCodeAt(0) + 10; // A=10 ... F=15
  return (prefix << 4) | n;
}

export function paramCommAddress(code: string): number {
  const p = MD520_PARAM_MAP[code];
  if (!p) return 0;
  return (groupHex(p.group) << 8) | p.index;
}

/** RAM 地址：F 组高位 F→0、A 组 A→4、B 组 B→5、C 组 C→6（通信手册 2.2） */
export function paramRamAddress(code: string): number {
  const p = MD520_PARAM_MAP[code];
  if (!p) return 0;
  const g = groupHex(p.group);
  const high = g >> 4;
  /** 只有 F/A/B/C 组适用高位换算；FP(0x1F)、U(0x1E) 等组直接用参数通信地址 */
  if (high < 0xa) return (g << 8) | p.index;
  const ramHigh = high === 0xf ? 0 : high - 6;
  return ((ramHigh << 12) | ((g & 0x0f) << 8) | p.index);
}

/**
 * Modbus 专用参数通信地址（通信手册 2.3 表 2-1/2-2）。
 * 十进制书写，供 mock-addresses.js --check 的十进制正则对照。
 */
/**
 * 08 用户手册 339 页 18.3「Modbus 专用参数通信地址」表 18-1 / 18-2。
 * 1000H~1020H 是监视 / 给定字，2000H~2004H 是只写控制参数，
 * 3000H / 7044H / 8000H 是状态与故障，7310H / 7311H 是频率与控制命令的另一组入口。
 * 教学子集只把 15 个常用字接入网关读写链路（CONNECT_WORDS / VFD_REGISTERS），
 * 其余在此登记地址口径，供现场通信程序查表，不进单字变量表。
 */
export const MD520_COMM = {
  SETPOINT: 4096,       // 1000H 通信设定值 -10000~10000（相对 F0-10 的百分比）
  RUN_FREQ: 4097,       // 1001H 运行频率
  BUS_VOLTAGE: 4098,    // 1002H 母线电压（只读）
  OUTPUT_VOLTAGE: 4099, // 1003H 输出电压（只读）
  OUTPUT_CURRENT: 4100, // 1004H 输出电流（只读）
  OUTPUT_POWER: 4101,   // 1005H 输出功率（只读）
  OUTPUT_TORQUE: 4102,  // 1006H 输出转矩（只读）
  RUN_SPEED: 4103,      // 1007H 运行速度（只读）
  DI_FLAGS: 4104,       // 1008H DI 输入标志
  DO_FLAGS: 4105,       // 1009H DO 输出标志
  AI1: 4106,            // 100AH AI1 电压
  AI2: 4107,            // 100BH AI2 电压（只读）
  AI3: 4108,            // 100CH AI3 电压（只读）
  FREQ2: 29456,         // 7310H 通信设定频率2（单位由 FD-09、小数点与 F0-22 一致）
  COMMAND1: 29457,      // 7311H 控制命令1（0 按 F6-10 停机 / 1~7）
  COMMAND2: 8192,       // 2000H 控制命令2（**无 0 档**，1~7；停机用 5 或 6）
  DO_CONTROL: 8193,     // 2001H 数字量输出端子控制（bit0 DO1 / bit1 DO2 / bit2 RELAY1…）
  AO1: 8194,            // 2002H 模拟输出 AO1 控制（0~7FFF = 0~100%）
  AO2: 8195,            // 2003H 模拟输出 AO2 控制
  PULSE_OUT: 8196,      // 2004H 脉冲 PULSE 输出控制
  STATUS1: 12288,       // 3000H 1正转/2反转/3停机/4辨识/5故障
  STATUS2: 28740,       // 7044H bit0运行 bit1方向 bit2故障 bit3到达 bit4通信正常
  PASSWORD: 7936,       // 1F00H 参数锁定密码校验（返回实际密码即校验通过）
  PARAM_INIT: 7937,     // 1F01H 通信专用参数初始化（1 恢复出厂 / 4 恢复备份 / 501 备份当前）
  FAULT_DESC: 32768,    // 8000H 变频器故障描述
} as const;

export const MD520_COMMAND = {
  /** 7311H「控制命令1」的 0 档（按 F6-10 停机），也是面板内部停机状态；
   *  2000H「控制命令2」没有 0 档，绝不把 0 写到 2000H，停机用 5/6。 */
  STOP: 0,
  FWD: 1,
  REV: 2,
  FJOG: 3,
  RJOG: 4,
  FREE_STOP: 5,
  STOP_BY_F6_10: 6,
  FAULT_RESET: 7,
} as const;

export const MD520_STATUS = {
  FWD: 1,
  REV: 2,
  STOP: 3,
  TUNING: 4,
  FAULT: 5,
} as const;

/** 物理端子（图 3-9 / 表 4-5）：控制板只有 5 路 DI，DI6~DI10 来自扩展卡。
 *  defaultFunction 是出厂默认功能码，真实角色由 F4-00~F4-04 当前值决定；label 只作兜底显示。 */
export const MD520_DI = [
  { key: 'DI1', param: 'F4-00', defaultFunction: 1, label: '正转运行' },
  { key: 'DI2', param: 'F4-01', defaultFunction: 2, label: '反转运行' },
  { key: 'DI3', param: 'F4-02', defaultFunction: 0, label: '无功能' },
  { key: 'DI4', param: 'F4-03', defaultFunction: 0, label: '无功能' },
  { key: 'DI5', param: 'F4-04', defaultFunction: 0, label: '无功能' },
] as const;

/**
 * DI 多段速（F0-02=1 端子、F0-03=6 多段指令）的教学演示 Hz 表：
 * 段位来自配成「多段指令端子1~4」的 DI 所组成的二进制位，不再写死 DI1~DI3。
 * 与 FC-00~FC-07 的百分比默认值一一对应（默认 F0-10=50Hz），也供独立虚拟 PLC
 * 的段速参考程序使用，保证面板 / PLC / 三维读数一致。
 */
export const MD520_MULTI_SPEED = [0, 10, 20, 30, 40, 50, 35, 25] as const;

/** AI 模拟量输入（表 4-5）：AI1 -10~10V / AI2 0~10V 或 0~20mA（S2/S3 拨码） */
export const MD520_AI = {
  AI1: { min: -10, max: 10, unit: 'V', impedance: '22kΩ' },
  AI2: { min: 0, max: 10, unit: 'V', currentMax: 20, currentUnit: 'mA' },
} as const;

export type Md520Ai2Mode = 'voltage' | 'current';

/** 频率源与命令源档位（功能手册 2.1 / 通信手册 2.3） */
export const MD520_SOURCE = {
  PANEL: 0,
  TERMINAL: 1,
  COMM: 2,
  CUSTOM: 3,
  FREQ_AI1: 2,
  FREQ_AI2: 3,
  FREQ_MULTI: 6,
  FREQ_COMM: 9,
} as const;

export const MD520_DO = [
  { key: 'DO1', bit: 0, label: '运行中' },
  { key: 'FM', bit: 4, label: '频率到达' },
  { key: 'RELAY', bit: 2, label: '故障' },
] as const;

/** STO：任一通道断开即封锁输出，优先级高于一切 PLC / 面板逻辑 */
export const MD520_STO = ['STO1', 'STO2'] as const;

/** 故障码为 Exxx.x 主码+子码格式（用户手册 35.2） */
export const MD520_FAULTS = [
  { code: 'E002.1', name: '硬件过流' },
  { code: 'E002.2', name: '软件过流' },
  { code: 'E019.1', name: '电机参数辨识故障' },
  { code: 'E019.2', name: '电机参数辨识故障' },
  { code: 'E019.5', name: '电机类型错误' },
  { code: 'E160.0', name: 'Modbus 超时' },
] as const;

/** 七段数码管可显示字符（用户手册表 16-5 子集） */
export const SEVEN_SEG_CHARS = '0123456789AbCdEFrHJLnoPTUy- .';

export const MD520_UNITS = ['kW', 'h', 's', 'r/min', 'Hz', 'A', 'V', '℃', '%'] as const;

export const MD520_MENUS = ['basic', 'user', 'changed', 'fault'] as const;
export type Md520Menu = (typeof MD520_MENUS)[number];

export const MD520_MENU_LABELS: Record<Md520Menu, string> = {
  basic: '基本菜单',
  user: '用户自定义参数',
  changed: '设定值有更改的参数',
  fault: '故障列表',
};
