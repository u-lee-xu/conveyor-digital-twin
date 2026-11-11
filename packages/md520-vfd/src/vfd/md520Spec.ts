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

export const MD520_PARAMS: Md520Param[] = [
  /** 08 用户手册 17.2.9：默认 2（V/f）；0=SVC 无速度传感器矢量、1=FVC 带 PG 闭环、2=V/f 开环。
   *  本虚拟面板只做参数镜像，不实现矢量控制算法，运行中不可改。 */
  { code: 'F0-01', group: 'F0', index: 1, name: '第1电机控制方式', defaultValue: 2, min: 0, max: 2, decimals: 0, unit: '',
    options: { 0: 'SVC', 1: 'FVC', 2: 'V/f' }, runLocked: true },
  { code: 'F0-02', group: 'F0', index: 2, name: '运行指令选择', defaultValue: 0, min: 0, max: 3, decimals: 0, unit: '',
    options: { 0: '操作面板', 1: '端子', 2: '通信', 3: '自定义' } },
  /** 默认值 0 按通用变频器惯例；MD520 手册抽取片段未给出 F0-03 出厂值，待参数手册核对 */
  { code: 'F0-03', group: 'F0', index: 3, name: '主频率指令输入选择', defaultValue: 0, min: 0, max: 9, decimals: 0, unit: '',
    options: { 0: '数字设定', 2: 'AI1', 3: 'AI2', 4: 'AI3', 5: '脉冲给定', 6: '多段指令', 8: 'PID', 9: '通讯给定' } },
  { code: 'F0-08', group: 'F0', index: 8, name: '预置频率', defaultValue: 50, min: 0, max: 599, decimals: 2, unit: 'Hz', runLocked: true },
  { code: 'F0-10', group: 'F0', index: 10, name: '最大频率', defaultValue: 50, min: 50, max: 599, decimals: 2, unit: 'Hz', runLocked: true },
  { code: 'F0-17', group: 'F0', index: 17, name: '加速时间1', defaultValue: 20, min: 0, max: 6500, decimals: 1, unit: 's' },
  { code: 'F0-18', group: 'F0', index: 18, name: '减速时间1', defaultValue: 20, min: 0, max: 6500, decimals: 1, unit: 's' },
  /** F1-00~F1-05 电机铭牌参数：08 用户手册 30 章参数表，调试流程 17.1.1 第 5 步整组设定。
   *  均为「停机更改」，虚拟面板只作参数镜像，不参与矢量辨识与输出计算。 */
  { code: 'F1-00', group: 'F1', index: 0, name: '电机类型选择', defaultValue: 0, min: 0, max: 4, decimals: 0, unit: '',
    options: { 0: '普通异步电机', 1: '变频异步电机', 2: '永磁同步电机',
      3: '无助磁磁阻电机', 4: '电磁线圈' }, runLocked: true },
  { code: 'F1-01', group: 'F1', index: 1, name: '电机额定功率', defaultValue: 3.7, min: 0.1, max: 1000, decimals: 1, unit: 'kW', runLocked: true },
  { code: 'F1-02', group: 'F1', index: 2, name: '电机额定电压', defaultValue: 380, min: 1, max: 2000, decimals: 0, unit: 'V', runLocked: true },
  { code: 'F1-03', group: 'F1', index: 3, name: '电机额定电流', defaultValue: 9, min: 0.01, max: 655.35, decimals: 2, unit: 'A', runLocked: true },
  { code: 'F1-04', group: 'F1', index: 4, name: '电机额定频率', defaultValue: 50, min: 0.01, max: 599, decimals: 2, unit: 'Hz', runLocked: true },
  { code: 'F1-05', group: 'F1', index: 5, name: '电机额定转速', defaultValue: 1460, min: 1, max: 65535, decimals: 0, unit: 'rpm', runLocked: true },
  { code: 'F4-00', group: 'F4', index: 0, name: 'DI1端子功能选择', defaultValue: 1, min: 0, max: 86, decimals: 0, unit: '' },
  { code: 'F4-11', group: 'F4', index: 11, name: '端子命令方式', defaultValue: 0, min: 0, max: 3, decimals: 0, unit: '',
    options: { 0: '两线式1', 1: '两线式2', 2: '三线式1', 3: '三线式2' } },
  { code: 'F5-00', group: 'F5', index: 0, name: 'FM端子输出方式选择', defaultValue: 0, min: 0, max: 1, decimals: 0, unit: '',
    options: { 0: 'FMP 脉冲输出', 1: 'FMR 开关量输出' } },
  { code: 'F7-01', group: 'F7', index: 1, name: 'MF.K键功能选择', defaultValue: 0, min: 0, max: 4, decimals: 0, unit: '',
    options: { 0: '无效', 1: '强制面板控制', 2: '正反转切换', 3: '正转点动', 4: '反转点动' } },
  { code: 'F7-02', group: 'F7', index: 2, name: 'STOP/RESET键功能', defaultValue: 0, min: 0, max: 3, decimals: 0, unit: '' },
  { code: 'FD-00', group: 'FD', index: 0, name: '波特率', defaultValue: 5005, min: 0, max: 6999, decimals: 0, unit: '' },
  { code: 'FD-01', group: 'FD', index: 1, name: 'Modbus数据格式', defaultValue: 0, min: 0, max: 7, decimals: 0, unit: '' },
  { code: 'FD-02', group: 'FD', index: 2, name: '本机地址', defaultValue: 1, min: 1, max: 247, decimals: 0, unit: '' },
  /** 302 页 17.2.3：默认 0（无操作）；501/503 是手册的特殊档位，不是 0~503 连续量程。 */
  { code: 'FP-01', group: 'FP', index: 1, name: '参数初始化', defaultValue: 0, min: 0, max: 503, decimals: 0, unit: '',
    options: { 0: '无操作', 1: '恢复出厂不含电机参数', 2: '清除记录信息',
      4: '备份用户当前参数', 501: '恢复用户备份参数', 503: '恢复出厂含电机参数' }, runLocked: true },
  { code: 'FP-02', group: 'FP', index: 2, name: '功能参数组显示选择', defaultValue: 63, min: 0, max: 65535, decimals: 0, unit: '' },
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
export const MD520_COMM = {
  SETPOINT: 4096,       // 1000H 通信设定值 -10000~10000
  RUN_FREQ: 4097,       // 1001H
  DI_FLAGS: 4104,       // 1008H
  DO_FLAGS: 4105,       // 1009H
  AI1: 4106,            // 100AH
  FREQ2: 29456,         // 7310H 通信设定频率2
  COMMAND1: 29457,      // 7311H 控制命令1
  COMMAND2: 8192,       // 2000H 控制命令2
  DO_CONTROL: 8193,     // 2001H 数字量输出端子控制
  AO1: 8194,            // 2002H
  STATUS1: 12288,       // 3000H 1正转/2反转/3停机/4辨识/5故障
  STATUS2: 28740,       // 7044H bit0运行 bit1方向 bit2故障 bit3到达 bit4通信正常
  FAULT_DESC: 32768,    // 8000H
} as const;

export const MD520_COMMAND = {
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

/** 物理端子（图 3-9 / 表 4-5）：控制板只有 5 路 DI，DI6~DI10 来自扩展卡 */
export const MD520_DI = [
  { key: 'DI1', param: 'F4-00', defaultFunction: 1, label: '多段速端子1' },
  { key: 'DI2', param: 'F4-01', defaultFunction: 2, label: '多段速端子2' },
  { key: 'DI3', param: 'F4-02', defaultFunction: 0, label: '多段速端子3' },
  { key: 'DI4', param: 'F4-03', defaultFunction: 0, label: '运行使能' },
  { key: 'DI5', param: 'F4-04', defaultFunction: 0, label: '高速脉冲输入' },
] as const;

/**
 * DI 多段速（F0-02=1 端子、F0-03=6 多段指令）：
 * DI1~DI3 组成 3 位二进制选段，DI4 作运行使能。
 * 段速为教学演示值，非 MD520 出厂值（FC-00~FC-07 需参数手册核对）。
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
