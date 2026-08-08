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
  { name: '启动按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_START, s7: S7_DISPLAY_VARS.BUTTON_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_START, desc: '启动分拣系统运行（自复位）' },
  { name: '停止按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_STOP, s7: S7_DISPLAY_VARS.BUTTON_STOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_STOP, desc: '正常停止：停皮带、停投料（自复位）' },
  { name: '急停按钮', modbus: MODBUS_DISPLAY_VARS.BUTTON_ESTOP, s7: S7_DISPLAY_VARS.BUTTON_ESTOP, mitsubishi: MITSUBISHI_DISPLAY_VARS.BUTTON_ESTOP, desc: '紧急停止：立即全停并置故障（自复位）' },
  { name: '1#入口传感器', modbus: MODBUS_DISPLAY_VARS.S1_BELT1_ENTRY, s7: S7_DISPLAY_VARS.S1_BELT1_ENTRY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S1_BELT1_ENTRY, desc: '1# 皮带入口有料检测' },
  { name: '1#运行传感器', modbus: MODBUS_DISPLAY_VARS.S2_BELT1_RUN, s7: S7_DISPLAY_VARS.S2_BELT1_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.S2_BELT1_RUN, desc: '1# 皮带运行且有料' },
  { name: '1#出口传感器', modbus: MODBUS_DISPLAY_VARS.S3_BELT1_EXIT, s7: S7_DISPLAY_VARS.S3_BELT1_EXIT, mitsubishi: MITSUBISHI_DISPLAY_VARS.S3_BELT1_EXIT, desc: '1# 皮带末端有料检测' },
  { name: '2#入口传感器', modbus: MODBUS_DISPLAY_VARS.S4_BELT2_ENTRY, s7: S7_DISPLAY_VARS.S4_BELT2_ENTRY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S4_BELT2_ENTRY, desc: '2# 筛分皮带入口有料检测' },
  { name: '2#运行传感器', modbus: MODBUS_DISPLAY_VARS.S5_BELT2_RUN, s7: S7_DISPLAY_VARS.S5_BELT2_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.S5_BELT2_RUN, desc: '2# 皮带运行且有料' },
  { name: '2#出口传感器', modbus: MODBUS_DISPLAY_VARS.S6_BELT2_EXIT, s7: S7_DISPLAY_VARS.S6_BELT2_EXIT, mitsubishi: MITSUBISHI_DISPLAY_VARS.S6_BELT2_EXIT, desc: '2# 皮带末端有料检测' },
  { name: '3#入口传感器', modbus: MODBUS_DISPLAY_VARS.S7_BELT3_ENTRY, s7: S7_DISPLAY_VARS.S7_BELT3_ENTRY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S7_BELT3_ENTRY, desc: '3# 筛下小料皮带入口有料检测' },
  { name: '3#运行传感器', modbus: MODBUS_DISPLAY_VARS.S8_BELT3_RUN, s7: S7_DISPLAY_VARS.S8_BELT3_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.S8_BELT3_RUN, desc: '3# 筛下皮带运行且有料' },
  { name: '3#出口传感器', modbus: MODBUS_DISPLAY_VARS.S9_BELT3_EXIT, s7: S7_DISPLAY_VARS.S9_BELT3_EXIT, mitsubishi: MITSUBISHI_DISPLAY_VARS.S9_BELT3_EXIT, desc: '3# 皮带末端有料检测' },
  { name: '堆料传感器', modbus: MODBUS_DISPLAY_VARS.S10_PILEUP, s7: S7_DISPLAY_VARS.S10_PILEUP, mitsubishi: MITSUBISHI_DISPLAY_VARS.S10_PILEUP, desc: '1# 入口堆积且皮带停运' },
  { name: '上料缸伸出到位', modbus: MODBUS_DISPLAY_VARS.CYL_FEED_OUT, s7: S7_DISPLAY_VARS.CYL_FEED_OUT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_FEED_OUT, desc: '上料气缸伸出磁性开关' },
  { name: '上料缸缩回到位', modbus: MODBUS_DISPLAY_VARS.CYL_FEED_IN, s7: S7_DISPLAY_VARS.CYL_FEED_IN, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_FEED_IN, desc: '上料气缸缩回磁性开关' },
];

const OUTPUT_SIGNALS: SignalRow[] = [
  { name: '1#皮带运行', modbus: MODBUS_DISPLAY_VARS.BELT1_RUN, s7: S7_DISPLAY_VARS.BELT1_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.BELT1_RUN, desc: '1# 给料皮带电机运行（需持续输出）' },
  { name: '2#皮带运行', modbus: MODBUS_DISPLAY_VARS.BELT2_RUN, s7: S7_DISPLAY_VARS.BELT2_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.BELT2_RUN, desc: '2# 筛分皮带电机运行（需持续输出）' },
  { name: '3#皮带运行', modbus: MODBUS_DISPLAY_VARS.BELT3_RUN, s7: S7_DISPLAY_VARS.BELT3_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.BELT3_RUN, desc: '3# 筛下小料皮带电机运行（需持续输出）' },
  { name: '4#皮带运行', modbus: MODBUS_DISPLAY_VARS.BELT4_RUN, s7: S7_DISPLAY_VARS.BELT4_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.BELT4_RUN, desc: '4# 大料收集皮带电机运行（需持续输出）' },
  { name: '上料缸伸出', modbus: MODBUS_DISPLAY_VARS.FEED_CYL_EXTEND, s7: S7_DISPLAY_VARS.FEED_CYL_EXTEND, mitsubishi: MITSUBISHI_DISPLAY_VARS.FEED_CYL_EXTEND, desc: '上料气缸伸出电磁阀（双电控脉冲触发）' },
  { name: '上料缸缩回', modbus: MODBUS_DISPLAY_VARS.FEED_CYL_RETRACT, s7: S7_DISPLAY_VARS.FEED_CYL_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.FEED_CYL_RETRACT, desc: '上料气缸缩回电磁阀（双电控脉冲触发）' },
  { name: '气吹分拣机', modbus: MODBUS_DISPLAY_VARS.SEPARATOR_ON, s7: S7_DISPLAY_VARS.SEPARATOR_ON, mitsubishi: MITSUBISHI_DISPLAY_VARS.SEPARATOR_ON, desc: '2# 皮带分拣机启动信号（需持续输出）' },
  { name: '1#运行指示', modbus: MODBUS_DISPLAY_VARS.IND_BELT1_RUN, s7: S7_DISPLAY_VARS.IND_BELT1_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.IND_BELT1_RUN, desc: '1# 皮带运行指示灯' },
  { name: '2#运行指示', modbus: MODBUS_DISPLAY_VARS.IND_BELT2_RUN, s7: S7_DISPLAY_VARS.IND_BELT2_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.IND_BELT2_RUN, desc: '2# 皮带运行指示灯' },
  { name: '3#运行指示', modbus: MODBUS_DISPLAY_VARS.IND_BELT3_RUN, s7: S7_DISPLAY_VARS.IND_BELT3_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.IND_BELT3_RUN, desc: '3# 皮带运行指示灯' },
  { name: '4#运行指示', modbus: MODBUS_DISPLAY_VARS.IND_BELT4_RUN, s7: S7_DISPLAY_VARS.IND_BELT4_RUN, mitsubishi: MITSUBISHI_DISPLAY_VARS.IND_BELT4_RUN, desc: '4# 皮带运行指示灯' },
  { name: '故障指示', modbus: MODBUS_DISPLAY_VARS.IND_FAULT, s7: S7_DISPLAY_VARS.IND_FAULT, mitsubishi: MITSUBISHI_DISPLAY_VARS.IND_FAULT, desc: '系统故障指示灯' },
];

const toRows = (rows: SignalRow[]) =>
  rows.map((r) => ({
    name: r.name,
    addressCells: [r.modbus, r.s7, r.mitsubishi],
    description: r.desc,
  }));

/** 煤料分拣帮助内容（共享帮助面板注入） */
export const buildBeltHelpContent = (): HelpContent => ({
  title: '煤料智能分拣 - 帮助',
  description: '使用说明与多协议IO地址分配对照表',
  steps: [
    { text: '在「PLC 连接」区域选择协议，填写连接参数，点击连接按钮' },
    { text: '在 PLC 编程软件/仿真器中运行控制程序（或直接操作输出线圈）' },
    { text: '3D 场景中的皮带、气缸、分拣机会实时响应 PLC 的输出信号' },
    { text: '传感器与磁性开关状态会实时写回 PLC 输入，供程序联锁判断' },
    { text: '演示模式内置参考流程，无需 PLC 即可观察完整分拣过程' },
  ],
  requirements: [
    '皮带电机需持续输出运行信号，双电控气缸（上料）由脉冲触发并自保持。',
    '上料流程：伸出上料气缸推入物料（入口传感器 S1 触发）→ 缩回气缸。',
    '分拣流程：2# 筛分皮带过滤小颗粒（经筛孔漏入正下方 3# 皮带，送至小料收集箱）→ 大料随 2# 皮带运至末端，落入 4# 收集皮带 → 4# 尽头大料收集框。',
    '1# 入口堆积且皮带停运时 S10 堆料传感器置位，需复位后重新启动。',
    '故障指示亮起时皮带应停止运行；故障消除并复位后恢复正常。',
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：标准 Modbus TCP 协议，线圈地址 0~26',
        '• Siemens S7：S7-1200/S7-1500/S7-300/S7-400，M 区地址 M0.0~M0.2、M10.x、M11.x、M20.x、M21.x',
        '• 三菱 MX Component：FX 系列，GX Simulator 2 直连，X0~X16、Y0~Y13（八进制编号）',
      ],
    },
    {
      icon: '🛒',
      name: '物料与投料',
      color: 'orange',
      description: '物料类型与自动投料',
      details: [
        '物料分煤/矸石两种，颗粒分小/中/大三档；煤石比例与尺寸权重可在手动面板调整。',
        '自动投料需 1# 皮带运行且物料未满（上限 20 件），间隔可在手动面板调节。',
        '小颗粒在 2# 筛孔带漏入正下方 3# 筛下皮带，送至小料收集箱；中/大颗粒随 2# 皮带运至末端，抛落入 4# 皮带，运至尽头大料收集框。',
      ],
    },
    {
      icon: '🚨',
      name: '故障与复位',
      color: 'red',
      description: '故障处理语义',
      details: [
        '急停：立即停止全部皮带并置位故障指示、鸣响蜂鸣器。',
        '复位：清除故障状态并停止蜂鸣器，之后方可重新启动。',
        '仿真面板支持急停/复位按钮，手动模式可模拟皮带故障。',
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
        hint: '按钮与传感器为孪生实时写入；输出信号由 PLC 程序控制。三菱 FX 系列 X/Y 为八进制编号（X7→X10，Y7→Y10）。ModbusTCP 使用线圈（Coil）地址从 0 开始编号。',
      },
    ],
  },
});
