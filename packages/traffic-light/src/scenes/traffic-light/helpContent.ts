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
  { name: '启动按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_START, s7: S7_DISPLAY_VARS.BUTTON_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_START, desc: '启动信号灯循环运行' },
  { name: '停止按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_STOP, s7: S7_DISPLAY_VARS.BUTTON_STOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_STOP, desc: '正常停止：完成当前循环后全灭' },
  { name: '急停按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_ESTOP, s7: S7_DISPLAY_VARS.BUTTON_ESTOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_ESTOP, desc: '紧急停止：立即全灭' },
];

const OUTPUT_LAMPS: SignalRow[] = [
  { name: '东西绿灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_EW_GREEN, s7: S7_DISPLAY_VARS.LIGHT_EW_GREEN, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_EW_GREEN, desc: '东西方向绿灯（含绿闪）' },
  { name: '东西黄灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_EW_YELLOW, s7: S7_DISPLAY_VARS.LIGHT_EW_YELLOW, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_EW_YELLOW, desc: '东西方向黄灯' },
  { name: '东西红灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_EW_RED, s7: S7_DISPLAY_VARS.LIGHT_EW_RED, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_EW_RED, desc: '东西方向红灯' },
  { name: '南北绿灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_NS_GREEN, s7: S7_DISPLAY_VARS.LIGHT_NS_GREEN, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_NS_GREEN, desc: '南北方向绿灯（含绿闪）' },
  { name: '南北黄灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_NS_YELLOW, s7: S7_DISPLAY_VARS.LIGHT_NS_YELLOW, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_NS_YELLOW, desc: '南北方向黄灯' },
  { name: '南北红灯', modbus: MODBUS_DISPLAY_VARS.LIGHT_NS_RED, s7: S7_DISPLAY_VARS.LIGHT_NS_RED, mitsubishi: MITSUBISHI_DISPLAY_VARS.LIGHT_NS_RED, desc: '南北方向红灯' },
];

const toRows = (rows: SignalRow[]) =>
  rows.map((r) => ({
    name: r.name,
    addressCells: [r.modbus, r.s7, r.mitsubishi],
    description: r.desc,
  }));

/** 交通灯帮助内容（共享帮助面板注入） */
export const buildTrafficHelpContent = (): HelpContent => ({
  title: '交通灯 - 帮助',
  description: '使用说明与多协议IO地址分配对照表',
  steps: [
    { text: '在「PLC 连接」区域选择协议，填写连接参数，点击连接按钮' },
    { text: '在 PLC 编程软件/仿真器中运行控制程序（或直接操作输出线圈）' },
    { text: '3D 路口信号灯会实时响应 PLC 的输出信号' },
    { text: '按下面板 启动/停止/急停 按钮可向 PLC 写入信号（自复位）' },
    { text: '演示模式内置参考程序，无需 PLC 即可观察标准时序' },
  ],
  requirements: [
    '上电初始状态：6 盏信号灯全部熄灭，等待启动。',
    '按下启动按钮，东西绿灯与南北红灯同时点亮，循环开始（东西先绿）。',
    '东西时序：绿灯稳定 → 绿灯闪烁（1Hz） → 黄灯 → 红灯 → 循环。',
    '南北时序与东西错相：南北红灯持续整个东西绿/闪/黄相位，随后南北绿灯亮 → 绿闪 → 黄灯 → 红灯 → 循环。',
    '运行期间任意时刻不得出现东西绿与南北绿同时点亮、绿灯与黄灯同时点亮（互锁）。',
    '按下停止按钮，完成当前循环（红灯结束）后 6 灯全部熄灭；再按启动重新运行。',
    '按下急停按钮，6 灯立即全部熄灭；复位急停后按启动重新运行。',
    '评分模式会自动发送启动/停止/急停信号并依据上述要求逐项评分（满分 100）。',
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：标准 Modbus TCP 协议，线圈地址 0~15',
        '• Siemens S7：S7-1200/S7-1500/S7-300/S7-400，M 区地址 M10.0~M10.2、M20.0~M20.5',
        '• 三菱 MX Component：FX 系列，GX Simulator 2 直连，X0~X2、Y0~Y5',
      ],
    },
    {
      icon: '⏱️',
      name: '时序参数',
      color: 'orange',
      description: '教师可调参数与判定容差',
      details: [
        '默认参数：绿稳 3s、绿闪 2s、黄灯 3s、红灯 8s，可在评分面板调整并自动保存。',
        '南北红灯时长自动派生 = 绿稳 + 绿闪 + 黄灯，保证南北与东西错相。',
        '时长判定窗口 = 设定值 ±40%；绿闪 1Hz（0.5s 亮/灭交替，相位 0.2~0.8s），交替 ≥2 次。',
      ],
    },
    {
      icon: '🚦',
      name: '停止与急停',
      color: 'red',
      description: '两种停止语义的区别',
      details: [
        '停止：按停止后跑完当前循环（红灯结束）再全部熄灭，模拟正常收尾。',
        '急停：按下后立即全部熄灭，无收尾过程。',
        '评分模式会分别验证两种停止行为与停止后再次启动的复亮。',
      ],
    },
  ],
  addresses: {
    columns: ['ModbusTCP', 'Siemens S7', '三菱 FX'],
    sections: [
      {
        title: '输入信号（按钮 → PLC）',
        icon: '📥',
        rows: toRows(INPUT_SIGNALS),
      },
      {
        title: '输出信号 - 信号灯（PLC → DT）',
        icon: '📤',
        rows: toRows(OUTPUT_LAMPS),
        hint: '输入信号为自复位按钮（按下 ON / 松开 OFF）；输出信号由 PLC 程序写入控制。三菱 FX 系列中 X/Y 为八进制编号（X7→X10，Y7→Y10）。ModbusTCP 使用线圈（Coil）地址从 0 开始编号。',
      },
    ],
  },
});
