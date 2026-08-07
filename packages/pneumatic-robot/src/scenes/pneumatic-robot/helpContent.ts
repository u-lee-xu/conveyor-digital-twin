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
  { name: '启动按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_START, s7: S7_DISPLAY_VARS.BUTTON_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_START, desc: '启动运行' },
  { name: '急停按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_ESTOP, s7: S7_DISPLAY_VARS.BUTTON_ESTOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_ESTOP, desc: '紧急停止' },
  { name: '停止按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_STOP, s7: S7_DISPLAY_VARS.BUTTON_STOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_STOP, desc: '正常停止' },
  { name: '水平原点', modbus: MODBUS_DISPLAY_VARS.MAG_FORWARD_REAR, s7: S7_DISPLAY_VARS.MAG_FORWARD_REAR, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_FORWARD_REAR, desc: '前后气缸缩回位磁性开关' },
  { name: '水平动点', modbus: MODBUS_DISPLAY_VARS.MAG_FORWARD_FRONT, s7: S7_DISPLAY_VARS.MAG_FORWARD_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_FORWARD_FRONT, desc: '前后气缸伸出位磁性开关' },
  { name: '升降原点', modbus: MODBUS_DISPLAY_VARS.MAG_LIFT_REAR, s7: S7_DISPLAY_VARS.MAG_LIFT_REAR, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_LIFT_REAR, desc: '升降气缸缩回位磁性开关' },
  { name: '升降动点', modbus: MODBUS_DISPLAY_VARS.MAG_LIFT_FRONT, s7: S7_DISPLAY_VARS.MAG_LIFT_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_LIFT_FRONT, desc: '升降气缸伸出位磁性开关' },
  { name: '夹爪松位', modbus: MODBUS_DISPLAY_VARS.MAG_CLAMP_OPEN, s7: S7_DISPLAY_VARS.MAG_CLAMP_OPEN, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_CLAMP_OPEN, desc: '夹爪松开位磁性开关' },
  { name: '夹爪紧位', modbus: MODBUS_DISPLAY_VARS.MAG_CLAMP_CLOSE, s7: S7_DISPLAY_VARS.MAG_CLAMP_CLOSE, mitsubishi: MITSUBISHI_DISPLAY_VARS.MAG_CLAMP_CLOSE, desc: '夹爪夹紧位磁性开关' },
];

const OUTPUT_SOLENOIDS: SignalRow[] = [
  { name: '水平缩回', modbus: MODBUS_DISPLAY_VARS.SOLENOID_FORWARD_RETRACT, s7: S7_DISPLAY_VARS.SOLENOID_FORWARD_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_FORWARD_RETRACT, desc: '前后气缸缩回电磁阀' },
  { name: '水平伸出', modbus: MODBUS_DISPLAY_VARS.SOLENOID_FORWARD_EXTEND, s7: S7_DISPLAY_VARS.SOLENOID_FORWARD_EXTEND, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_FORWARD_EXTEND, desc: '前后气缸伸出电磁阀' },
  { name: '升降缩回', modbus: MODBUS_DISPLAY_VARS.SOLENOID_LIFT_RETRACT, s7: S7_DISPLAY_VARS.SOLENOID_LIFT_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_LIFT_RETRACT, desc: '升降气缸缩回电磁阀' },
  { name: '升降伸出', modbus: MODBUS_DISPLAY_VARS.SOLENOID_LIFT_EXTEND, s7: S7_DISPLAY_VARS.SOLENOID_LIFT_EXTEND, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_LIFT_EXTEND, desc: '升降气缸伸出电磁阀' },
  { name: '夹爪松开', modbus: MODBUS_DISPLAY_VARS.SOLENOID_CLAMP_OPEN, s7: S7_DISPLAY_VARS.SOLENOID_CLAMP_OPEN, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_CLAMP_OPEN, desc: '夹爪松开电磁阀' },
  { name: '夹爪夹紧', modbus: MODBUS_DISPLAY_VARS.SOLENOID_CLAMP_CLOSE, s7: S7_DISPLAY_VARS.SOLENOID_CLAMP_CLOSE, mitsubishi: MITSUBISHI_DISPLAY_VARS.SOLENOID_CLAMP_CLOSE, desc: '夹爪夹紧电磁阀' },
];

const OUTPUT_INDICATORS: SignalRow[] = [
  { name: '原点', modbus: MODBUS_DISPLAY_VARS.INDICATOR_ORIGIN, s7: S7_DISPLAY_VARS.INDICATOR_ORIGIN, mitsubishi: MITSUBISHI_DISPLAY_VARS.INDICATOR_ORIGIN, desc: '原点指示灯' },
  { name: '工作', modbus: MODBUS_DISPLAY_VARS.INDICATOR_WORKING, s7: S7_DISPLAY_VARS.INDICATOR_WORKING, mitsubishi: MITSUBISHI_DISPLAY_VARS.INDICATOR_WORKING, desc: '运行指示灯' },
  { name: '加工', modbus: MODBUS_DISPLAY_VARS.INDICATOR_PROCESSING, s7: S7_DISPLAY_VARS.INDICATOR_PROCESSING, mitsubishi: MITSUBISHI_DISPLAY_VARS.INDICATOR_PROCESSING, desc: '加工指示灯' },
  { name: '报警', modbus: MODBUS_DISPLAY_VARS.INDICATOR_ALARM, s7: S7_DISPLAY_VARS.INDICATOR_ALARM, mitsubishi: MITSUBISHI_DISPLAY_VARS.INDICATOR_ALARM, desc: '报警指示灯' },
];

const toRows = (rows: SignalRow[]) =>
  rows.map((r) => ({
    name: r.name,
    addressCells: [r.modbus, r.s7, r.mitsubishi],
    description: r.desc,
  }));

/** 气动机械手帮助内容（共享帮助面板注入） */
export const buildRobotHelpContent = (): HelpContent => ({
  title: '气动机械手 - 帮助',
  description: '使用说明与多协议IO地址分配对照表',
  steps: [
    { text: '在「PLC 连接」区域选择协议，填写连接参数，点击连接按钮' },
    { text: '在 PLC 编程软件/仿真器中操作 输出线圈 或运行 PLC 程序' },
    { text: '3D 模型会实时响应 PLC 控制信号' },
    { text: '按下面板 启动/停止/急停 按钮可向 PLC 写入信号（自复位）' },
    { text: '模型传感器的到位信号会自动反馈给 PLC 的输入' },
  ],
  requirements: [
    '原点状态：前后气缸缩回（水平原点 ON）、升降气缸升起（升降原点 ON）、夹爪张开（夹爪松位 ON），此时蓝色原点指示灯亮。',
    '按下启动按钮，升降气缸下降取料，下降到位（升降动点 ON）后夹爪夹紧，夹紧到位（夹爪紧位 ON）后升降气缸升起。',
    '升降气缸回到升起位（升降原点 ON）后，前后气缸伸出前进放料，伸出到位（水平动点 ON）后升降气缸再次下降放料。',
    '下降到位（升降动点 ON）后夹爪张开放下物料，松开到位（夹爪松位 ON）后升降气缸升起，前后气缸缩回返回原点。',
    '运行过程中绿色运行指示灯亮；夹取/搬运物料时黄色加工指示灯亮；急停按下时红色报警指示灯亮，系统立即停止。',
    '按下停止按钮，系统完成当前动作后停止；急停按下后需先复位急停再重新启动。',
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：标准 Modbus TCP 协议，线圈地址 0~19',
        '• Siemens S7：S7-1200/S7-1500/S7-300/S7-400，M 区地址',
        '• 三菱 MX Component：FX 系列，GX Simulator 2 直连，X/Y 地址',
      ],
    },
    {
      icon: '🧲',
      name: '电磁阀类型说明',
      color: 'orange',
      description: '双电控与单电控的区别',
      details: [
        '双电控（自保持）：使用两个线圈（缩回+伸出），采用上升沿触发。脉冲 ON→OFF 后气缸保持当前位置。例如 Y1 得电脉冲后气缸伸出，Y1 断电后仍保持伸出，直到 Y0 得电脉冲才缩回。',
        '单电控（弹簧复位）：仅使用伸出/夹紧线圈，电平直接控制。线圈得电→伸出/夹紧，线圈失电→弹簧自动复位缩回/松开。缩回/松开线圈不使用。可在仿真面板中实时切换。',
      ],
    },
    {
      icon: '📡',
      name: '传感器反馈',
      color: 'green',
      description: '输入信号自动写入',
      details: [
        '输入信号由数字孪生模型的磁性开关自动写入，无需手动操作。气缸到达极限位置时，对应的磁性开关信号自动置 ON。',
      ],
    },
  ],
  addresses: {
    columns: ['ModbusTCP', 'Siemens S7', '三菱 FX'],
    sections: [
      {
        title: '输入信号（DT→PLC）',
        icon: '📥',
        rows: toRows(INPUT_SIGNALS),
      },
      {
        title: '输出信号 - 电磁阀（PLC→DT）',
        icon: '📤',
        rows: toRows(OUTPUT_SOLENOIDS),
      },
      {
        title: '输出信号 - 指示灯（PLC→DT）',
        icon: '💡',
        rows: toRows(OUTPUT_INDICATORS),
        hint: '输入信号由数字孪生模型磁性开关自动写入，PLC 程序只需读取；输出信号由 PLC 程序写入控制。三菱 FX 系列中 X/Y 为八进制编号（X7→X10，Y7→Y10）。ModbusTCP 使用线圈（Coil）地址从 0 开始编号。',
      },
    ],
  },
});
