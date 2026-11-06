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
  { name: '原点传感器', modbus: MODBUS_DISPLAY_VARS.S_LIMIT_START, s7: S7_DISPLAY_VARS.S_LIMIT_START, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_LIMIT_START, desc: '滑台回到起点触发（±5mm，带滞回）；兼作增量编码器 Z 相回零基准' },
  { name: '终点传感器', modbus: MODBUS_DISPLAY_VARS.S_LIMIT_END, s7: S7_DISPLAY_VARS.S_LIMIT_END, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_LIMIT_END, desc: '滑台到达终点放药位触发（±5mm，带滞回）' },
  { name: 'A仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_A_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_A_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_A_EMPTY, desc: 'A 药仓无药（指示灯闪）' },
  { name: 'B仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_B_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_B_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_B_EMPTY, desc: 'B 药仓无药（指示灯闪）' },
  { name: 'C仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_C_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_C_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_C_EMPTY, desc: 'C 药仓无药（指示灯闪）' },
  { name: 'D仓空仓', modbus: MODBUS_DISPLAY_VARS.S_MAG_D_EMPTY, s7: S7_DISPLAY_VARS.S_MAG_D_EMPTY, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_MAG_D_EMPTY, desc: 'D 药仓无药（指示灯闪）' },
  { name: '取药仓有药', modbus: MODBUS_DISPLAY_VARS.S_BIN_HAS_DRUG, s7: S7_DISPLAY_VARS.S_BIN_HAS_DRUG, mitsubishi: MITSUBISHI_DISPLAY_VARS.S_BIN_HAS_DRUG, desc: '取药仓内有药' },
  { name: 'A缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_A_BACK, s7: S7_DISPLAY_VARS.MSC_A_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_A_BACK, desc: 'A 送药缸缩回磁性开关' },
  { name: 'A缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_A_FRONT, s7: S7_DISPLAY_VARS.MSC_A_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_A_FRONT, desc: 'A 送药缸伸出磁性开关' },
  { name: 'B缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_B_BACK, s7: S7_DISPLAY_VARS.MSC_B_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_B_BACK, desc: 'B 送药缸缩回磁性开关' },
  { name: 'B缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_B_FRONT, s7: S7_DISPLAY_VARS.MSC_B_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_B_FRONT, desc: 'B 送药缸伸出磁性开关' },
  { name: 'C缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_C_BACK, s7: S7_DISPLAY_VARS.MSC_C_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_C_BACK, desc: 'C 送药缸缩回磁性开关' },
  { name: 'C缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_C_FRONT, s7: S7_DISPLAY_VARS.MSC_C_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_C_FRONT, desc: 'C 送药缸伸出磁性开关' },
  { name: 'D缸退回位', modbus: MODBUS_DISPLAY_VARS.MSC_D_BACK, s7: S7_DISPLAY_VARS.MSC_D_BACK, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_D_BACK, desc: 'D 送药缸缩回磁性开关' },
  { name: 'D缸伸出位', modbus: MODBUS_DISPLAY_VARS.MSC_D_FRONT, s7: S7_DISPLAY_VARS.MSC_D_FRONT, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_D_FRONT, desc: 'D 送药缸伸出磁性开关' },
  { name: '翻转盛药位', modbus: MODBUS_DISPLAY_VARS.MSC_TILT_HOLD, s7: S7_DISPLAY_VARS.MSC_TILT_HOLD, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_TILT_HOLD, desc: '翻转缸盛药位磁性开关' },
  { name: '翻转倒药位', modbus: MODBUS_DISPLAY_VARS.MSC_TILT_DUMP, s7: S7_DISPLAY_VARS.MSC_TILT_DUMP, mitsubishi: MITSUBISHI_DISPLAY_VARS.MSC_TILT_DUMP, desc: '翻转缸倒药位磁性开关' },
];

const OUTPUT_SIGNALS: SignalRow[] = [
  { name: '电机正转', modbus: MODBUS_DISPLAY_VARS.MOTOR_FWD, s7: S7_DISPLAY_VARS.MOTOR_FWD, mitsubishi: MITSUBISHI_DISPLAY_VARS.MOTOR_FWD, desc: '滑台正向移动（起点→终点）' },
  { name: '电机反转', modbus: MODBUS_DISPLAY_VARS.MOTOR_REV, s7: S7_DISPLAY_VARS.MOTOR_REV, mitsubishi: MITSUBISHI_DISPLAY_VARS.MOTOR_REV, desc: '滑台反向移动（终点→起点）' },
  { name: 'A送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_A, s7: S7_DISPLAY_VARS.CYL_SEND_A, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_A, desc: 'A 药仓推药气缸（伸=推 1 粒）' },
  { name: 'B送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_B, s7: S7_DISPLAY_VARS.CYL_SEND_B, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_B, desc: 'B 药仓推药气缸（伸=推 1 粒）' },
  { name: 'C送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_C, s7: S7_DISPLAY_VARS.CYL_SEND_C, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_C, desc: 'C 药仓推药气缸（伸=推 1 粒）' },
  { name: 'D送药缸', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_D, s7: S7_DISPLAY_VARS.CYL_SEND_D, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_D, desc: 'D 药仓推药气缸（伸=推 1 粒）' },
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
    { text: '原点/终点传感器、磁性开关、空仓等信号实时写回 PLC 输入；位置由数据寄存器 HR120（增量式编码器脉冲）反馈，8 位线圈是它的位镜像' },
    { text: '演示模式内置参考流程，无需 PLC 即可观察完整配药过程' },
  ],
  requirements: [
    '配方：每仓 0~9 份，启动时锁存。按 A→B→C→D 顺序逐仓取药。',
    '取药：滑台移动到药仓下方 → 退药气缸伸出推 1 粒 → 药片作为刚体受重力沿落料斜槽滑落、被取药料斗接住 → 缩缸补位 → 按份数重复。',
    '倒药：滑台到终点翻转料斗，药片落入取药仓 → 回起点 → 黄灯亮请取药 → 取药确认后进入下一轮。',
    '空仓：空仓传感器置位。演示模式红灯闪烁 1.2s 后自动补满该仓并继续取药；手动/仿真模式不会自愈，需点「⊕ 补满四仓」人工加药。',
    '药仓容量每仓 10 粒；推空后伸缸不再出药。「复位」只回起点清状态，不补药，补药是独立操作。',
    '停止=暂停（位置保持），复位=回起点清状态，急停=立即全停+红灯。',
    '位置反馈：原点/终点各一个接近开关；数据寄存器 HR120 是增量式编码器脉冲计数（0.01m/脉冲），前进 +、后退 -，回原点传感器时归零。',
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：标准 Modbus TCP 协议，线圈地址 0~49（含编码器 8 位镜像），保持寄存器 HR120 存增量式编码器脉冲',
        '• Siemens S7：S7-1200/S7-1500/S7-300/S7-400，M 区地址 M0.0~M32.0',
        '• 三菱 MX Component：FX 系列，GX Simulator 2 直连，X0~X37、Y0~Y8（八进制编号）',
      ],
    },
    {
      icon: '📐',
      name: '原点/终点传感器与位置寄存器',
      color: 'green',
      description: '增量式编码器反馈',
      details: [
        '原点、终点各装一个接近开关，滑台进入 ±5mm 窗口即触发（离开用 ±15mm，滞回防抖）。3D 机架上可见开关本体与状态 LED。',
        '数据寄存器 HR120 / MW120 / D120 存脉冲计数：0.01m = 1 脉冲，行程 0~170；滑台前进递增、后退递减，不是绝对坐标直写。',
        '增量式编码器没有绝对零点：只有回到原点传感器（Z 相）才把寄存器校准归零。',
        '8 位线圈 ENCODER_BIT0-7 是该寄存器的位镜像；虚拟 PLC 读寄存器得到位置，再输出电机正/反转，形成闭环。',
      ],
    },
    {
      icon: '⚛️',
      name: '物理世界（供药段）',
      color: 'blue',
      description: '药片是刚体，不是预设轨迹动画',
      details: [
        '退药气缸推板把最底一粒药顶出托板出口，药片以「行程/伸缸时间」为初速度进入落料斜槽。',
        '斜槽面、两侧导轨、取药料斗的底板与四壁都是真实碰撞体；药片靠重力沿 49° 斜槽下滑，越过斗口后被料斗接住。',
        '整机等比放大 3 倍，重力也放大 3 倍，因此运动时间尺度与 1:1 真实设备一致；镜像布局下碰撞体同步镜像。',
        '药片越过料斗口平面才计入料斗存量；低帧率下用「上一帧→当前帧」线段与斗口求交判定，不会漏判。',
        '若刚体异常未落斗，流程有超时兜底结算，演示状态机不会卡死；倒药段仍用可视化抛落轨迹。',
      ],
    },
    {
      icon: '💊',
      name: '配药流程',
      color: 'orange',
      description: '自动配药过程',
      details: [
        '启动后滑台依次移动至 A/B/C/D 药仓，每仓按配方份数推药（1 推 1 粒）。',
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
        '空仓：对应空仓传感器置位；演示流程自动补满该仓，手动/仿真模式点「⊕ 补满四仓」人工加药。',
        '推空药仓：四仓各 10 粒，用完后伸缸不再出药，料筒不会凭空再生；刷新页面也可恢复初始库存。',
        '急停：立即停止全部输出并亮红灯；松开急停后红灯灭，需复位后重新启动。',
        '复位：回起点并清空流程状态，之后方可重新启动；不改变药仓余量。',
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
      {
        title: '数据寄存器（孪生 → PLC）',
        icon: '📐',
        rows: [{
          name: '增量式编码器脉冲计数',
          addressCells: ['HR120', 'MW120', 'D120'],
          description: '原点=0，前进 +、后退 -，回原点传感器（Z 相）归零；0.01m/脉冲，量程 0~170。8 位线圈 ENCODER_BIT0-7 为其位镜像。',
        }],
        hint: '保持寄存器是数值量，线圈表只放布尔量；虚拟 PLC 以该寄存器作为位置反馈，独立运行时自动退回内部积分。',
      },
    ],
  },
});
