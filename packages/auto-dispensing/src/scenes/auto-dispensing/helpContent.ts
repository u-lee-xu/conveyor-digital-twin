import type { HelpContent } from '@digital-twin/shared';
import {
  MODBUS_DISPLAY_VARS,
  S7_DISPLAY_VARS,
  MITSUBISHI_DISPLAY_VARS,
} from './constants';

interface SignalRow {
  name: string;
  modbus: string;
  s7: string;
  mitsubishi: string;
  desc: string;
}

const INPUT_SIGNALS: SignalRow[] = [
  { name: '启动按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_START, s7: S7_DISPLAY_VARS.BUTTON_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_START, desc: '启动配药流程（自复位）' },
  { name: '停止按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_STOP, s7: S7_DISPLAY_VARS.BUTTON_STOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_STOP, desc: '停止：暂停流程，输出清（自复位）' },
  { name: '复位按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_RESET, s7: S7_DISPLAY_VARS.BUTTON_RESET, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_RESET, desc: '复位：回起点并清状态（自复位）' },
  { name: '急停按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_ESTOP, s7: S7_DISPLAY_VARS.BUTTON_ESTOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_ESTOP, desc: '急停：全停+红灯（自复位）' },
  { name: '取药确认按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_CONFIRM, s7: S7_DISPLAY_VARS.BUTTON_CONFIRM, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_CONFIRM, desc: '取药后确认，进入下一轮（自复位）' },
  { name: '起始限位', modbus: MODBUS_DISPLAY_VARS.S_LIMIT_START, s7: S7_DISPLAY_VARS.S_LIMIT_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_LIMIT_START, desc: '滑台位于起点' },
  { name: '终点限位', modbus: MODBUS_DISPLAY_VARS.S_LIMIT_END, s7: S7_DISPLAY_VARS.S_LIMIT_END, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_LIMIT_END, desc: '滑台位于终点（翻转取药位）' },
  { name: 'A仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_A_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_A_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_A_EMPTY, desc: 'A 药仓无药（指示灯闪）' },
  { name: 'B仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_B_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_B_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_B_EMPTY, desc: 'B 药仓无药（指示灯闪）' },
  { name: 'C仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_C_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_C_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_C_EMPTY, desc: 'C 药仓无药（指示灯闪）' },
  { name: '取药仓有药', modbus: MODBUS_DISPLAY_VARS.S_BIN_HAS_DRUG, s7: S7_DISPLAY_VARS.S_BIN_HAS_DRUG, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_BIN_HAS_DRUG, desc: '取药仓内有药' },
  { name: 'A缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_A_BACK, s7: S7_DISPLAY_VARS.MSC_A_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_A_BACK, desc: 'A 送药缸缩回磁性开关' },
  { name: 'A缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_A_FRONT, s7: S7_DISPLAY_VARS.MSC_A_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_A_FRONT, desc: 'A 送药缸伸出磁性开关' },
  { name: 'B缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_B_BACK, s7: S7_DISPLAY_VARS.MSC_B_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_B_BACK, desc: 'B 送药缸缩回磁性开关' },
  { name: 'B缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_B_FRONT, s7: S7_DISPLAY_VARS.MSC_B_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_B_FRONT, desc: 'B 送药缸伸出磁性开关' },
  { name: 'C缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_C_BACK, s7: S7_DISPLAY_VARS.MSC_C_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_C_BACK, desc: 'C 送药缸缩回磁性开关' },
  { name: 'C缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_C_FRONT, s7: S7_DISPLAY_VARS.MSC_C_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_C_FRONT, desc: 'C 送药缸伸出磁性开关' },
  { name: '翻转盛药位', modbus: MODBUS_DISPLAY_VARS.MSC_TILT_HOLD, s7: S7_DISPLAY_VARS.MSC_TILT_HOLD, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_TILT_HOLD, desc: '翻转缸盛药位磁性开关' },
  { name: '翻转倒药位', modbus: MODBUS_DISPLAY_VARS.MSC_TILT_DUMP, s7: S7_DISPLAY_VARS.MSC_TILT_DUMP, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_TILT_DUMP, desc: '翻转缸倒药位磁性开关' },
];

const OUTPUT_SIGNALS: SignalRow[] = [
  { name: '电机正转', modbus: MODBUS_DISPLAY_VARS.MOTOR_FWD, s7: S7_DISPLAY_VARS.MOTOR_FWD, mitsubishi: MITSUBISHI_DISPLAY_VARS.MOTOR_FWD, desc: '滑台正向移动（起点→终点）' },
  { name: '电机反转', modbus: MODBUS_DISPLAY_VARS.MOTOR_REV, s7: S7_DISPLAY_VARS.MOTOR_REV, mitsubishi: MITSUBISHI_DISPLAY_VARS.MOTOR_REV, desc: '滑台反向移动（终点→起点）' },
  { name: 'A送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_A, s7: S7_DISPLAY_VARS.CYL_SEND_A, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_A, desc: 'A 药仓推药气缸（伸=推 1 粒）' },
  { name: 'B送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_B, s7: S7_DISPLAY_VARS.CYL_SEND_B, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_B, desc: 'B 药仓推药气缸（伸=推 1 粒）' },
  { name: 'C送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_C, s7: S7_DISPLAY_VARS.CYL_SEND_C, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_C, desc: 'C 药仓推药气缸（伸=推 1 粒）' },
  { name: '翻转缸', modbus: MODBUS_DISPLAY_VARS.CYL_TILT, s7: S7_DISPLAY_VARS.CYL_TILT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_TILT, desc: '料斗翻转倒药（终点）' },
  { name: '灯塔绿', modbus: MODBUS_DISPLAY_VARS.LAMP_GREEN, s7: S7_DISPLAY_VARS.LAMP_GREEN, mitsubishi: MITSUBISHI_DISPLAY_VARS.LAMP_GREEN, desc: '运行中' },
  { name: '灯塔黄', modbus: MODBUS_DISPLAY_VARS.LAMP_YELLOW, s7: S7_DISPLAY_VARS.LAMP_YELLOW, mitsubishi: MITSUBISHI_DISPLAY_VARS.LAMP_YELLOW, desc: '请取药/暂停' },
  { name: '灯塔红', modbus: MODBUS_DISPLAY_VARS.LAMP_RED, s7: S7_DISPLAY_VARS.LAMP_RED, mitsubishi: MITSUBISHI_DISPLAY_VARS.LAMP_RED, desc: '故障/空仓闪' },
];

const toRows = (rows: SignalRow[]) =>
  rows.map((r) => ({
    name: r.name,
    addressCells: [r.modbus, r.s7, r.mitsubishi],
    description: r.desc,
  }));

/** 自动配药帮助内容（共享帮助面板注入） */
export const buildDispensingHelpContent = (): HelpContent => ({
  title: '自动配药系统 - 帮助',
  description: '使用说明与多协议IO地址分配对照表',
  steps: [
    { text: '在「PLC 连接」区域选择协议，填写连接参数，点击连接按钮' },
    { text: '在 PLC 编程软件/仿真器中运行控制程序（或直接操作输出线圈）' },
    { text: '3D 场景中的滑台、气缸、料斗、灯塔会实时响应 PLC 的输出信号' },
    { text: '限位、磁性开关、编码器、空仓等信号会实时写回 PLC 输入，供程序联锁判断' },
    { text: '演示模式内置参考流程，无需 PLC 即可观察完整配药过程' },
  ],
  requirements: [
    '配方：每仓 0~9 份，启动时锁存。按 A→B→C 顺序逐仓取药。',
    '取药：滑台移动到药仓下方 → 送药缸伸出推 1 粒（缩回后上方药片自动下落补位）→ 按份数重复。',
    '倒药：滑台到终点翻转料斗，药片落入取药仓 → 回起点 → 黄灯亮请取药 → 取药确认后进入下一轮。',
    '空仓：空仓传感器置位，红灯闪烁提示补药，跳过该仓取药。',
    '停止=暂停（位置保持），复位=回起点清状态，急停=立即全停+红灯。',
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：标准 Modbus TCP 协议，线圈地址 0~47（编码器 8 位）',
        '• Siemens S7：S7-1200/S7-1500/S7-300/S7-400，M 区地址 M0.0~M32.0',
        '• 三菱 MX Component：FX 系列，GX Simulator 2 直连，X0~X37、Y0~Y8（八进制编号）',
      ],
    },
    {
      icon: '💊',
      name: '配药流程',
      color: 'orange',
      description: '自动配药过程',
      details: [
        '启动后滑台依次移动至 A/B/C 药仓，每仓按配方份数推药（1 推 1 粒）。',
        '取完所有仓后滑台到终点，翻转缸翻转料斗把药片倒入取药仓。',
        '回起点后黄灯亮等待人工取药；确认按钮按下后开始下一轮循环。',
      ],
    },
    {
      icon: '🚨',
      name: '故障与复位',
      color: 'red',
      description: '故障处理语义',
      details: [
        '空仓：对应空仓传感器置位，红灯闪烁提示补药，该仓跳过。',
        '急停：立即停止全部输出并亮红灯；松开急停后红灯灭，需复位后重新启动。',
        '复位：回起点并清空流程状态，之后方可重新启动。',
      ],
    },
  ],
  addresses: {
    columns: ['ModbusTCP', 'Siemens S7', '三菱 FX'],
    sections: [
      {
        title: '输入信号（孪生 → PLC）',
        icon: '📥',
        rows: toRows(INPUT_SIGNALS),
      },
      {
        title: '输出信号（PLC → 孪生）',
        icon: '📤',
        rows: toRows(OUTPUT_SIGNALS),
        hint: '按钮、传感器与编码器由孪生实时写入；输出信号由 PLC 程序控制。三菱 FX 系列 X/Y 为八进制编号。ModbusTCP 使用线圈（Coil）地址从 0 开始编号。',
      },
    ],
  },
});
