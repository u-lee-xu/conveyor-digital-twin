import type { HelpContent } from '@digital-twin/shared';
import {
  MODBUS_DISPLAY_VARS,
  S7_DISPLAY_VARS,
  MITSUBISHI_DISPLAY_VARS,
  ENCODER_DINT,
  ENCODER_REG_LABEL,
  SCREW_DETAIL, ENCODER_PULSES_PER_REV, PULSES_PER_M, ENCODER_PULSES_MAX, PULSE_LENGTH_MM,
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
  { name: '手动档（选择开关）', modbus: MODBUS_DISPLAY_VARS.SEL_MANUAL, s7: S7_DISPLAY_VARS.SEL_MANUAL, mitsubishi: MITSUBISHI_DISPLAY_VARS.SEL_MANUAL, desc: '控制柜两位旋钮拨到「手动」，与自动档互锁' },
  { name: '自动档（选择开关）', modbus: MODBUS_DISPLAY_VARS.SEL_AUTO, s7: S7_DISPLAY_VARS.SEL_AUTO, mitsubishi: MITSUBISHI_DISPLAY_VARS.SEL_AUTO, desc: '控制柜两位旋钮拨到「自动」，与手动档互锁' },
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
  { name: 'A缸缩回', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_A_RETRACT, s7: S7_DISPLAY_VARS.CYL_SEND_A_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_A_RETRACT, desc: '双电控专用：A 送药缸缩回线圈（单电控不使用）' },
  { name: 'B缸缩回', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_B_RETRACT, s7: S7_DISPLAY_VARS.CYL_SEND_B_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_B_RETRACT, desc: '双电控专用：B 送药缸缩回线圈（单电控不使用）' },
  { name: 'C缸缩回', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_C_RETRACT, s7: S7_DISPLAY_VARS.CYL_SEND_C_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_C_RETRACT, desc: '双电控专用：C 送药缸缩回线圈（单电控不使用）' },
  { name: 'D缸缩回', modbus: MODBUS_DISPLAY_VARS.CYL_SEND_D_RETRACT, s7: S7_DISPLAY_VARS.CYL_SEND_D_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_SEND_D_RETRACT, desc: '双电控专用：D 送药缸缩回线圈（单电控不使用）' },
  { name: '翻转回位', modbus: MODBUS_DISPLAY_VARS.CYL_TILT_RETRACT, s7: S7_DISPLAY_VARS.CYL_TILT_RETRACT, mitsubishi: MITSUBISHI_DISPLAY_VARS.CYL_TILT_RETRACT, desc: '双电控专用：翻转缸回到盛药位线圈（单电控不使用）' },
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
    { text: '在 PLC 编程软件/仿真器中运行控制程序，由程序驱动输出线圈' },
    { text: '3D 场景中的滑台、气缸、料斗、灯塔会实时响应 PLC 的输出信号；仿真面板的输出点在 IO 信号表中只读显示' },
    { text: '原点/终点传感器、磁性开关、空仓等信号实时写回 PLC 输入；位置由一个 32 位 DINT 数据寄存器反馈，不占用任何输入点或线圈' },
    { text: '仿真面板可切换「电磁阀类型」：单电控电平跟随 / 双电控上升沿自保持，两种 PLC 程序都能对线' },
    { text: '演示模式内置参考流程，无需 PLC 即可观察完整配药过程' },
  ],
  requirements: [
    '配方：每仓 0~9 份，启动时锁存。按 A→B→C→D 顺序逐仓取药。',
    '取药：滑台移动到药仓下方 → 退药气缸伸出推 1 粒 → 药片作为刚体受重力沿落料斜槽滑落、被取药料斗接住 → 缩缸补位 → 按份数重复。',
    '倒药：滑台到终点翻转料斗，药片落入取药仓 → 回起点 → 黄灯亮请取药 → 取药确认后进入下一轮。',
    '空仓：空仓传感器置位。演示模式红灯闪烁 1.2s 后自动补满该仓并继续取药；手动/仿真模式不会自愈，需点「⊕ 补满四仓」人工加药。',
    '药仓容量每仓 10 粒；推空后伸缸不再出药。「复位」只回起点清状态，不补药，补药是独立操作。',
    '停止=暂停（位置保持），复位=回起点清状态，急停=立即全停+红灯。',
    `位置反馈：原点/终点各一个接近开关；${ENCODER_REG_LABEL} 组成 32 位有符号 DINT（${ENCODER_PULSES_PER_REV} 脉冲/转 × ${SCREW_DETAIL.LEAD * 1000}mm 导程 → 1 脉冲 ≈ ${PULSE_LENGTH_MM.toFixed(4)}mm），前进 +、后退 -，回原点传感器时归零，不占输入点。`,
  ],
  notes: [
    {
      icon: '🔌',
      name: '支持的协议',
      color: 'blue',
      description: '三种协议连接方式',
      details: [
        '• ModbusTCP：线圈 0~45 只放布尔 IO（41~45 为双电控专用缩回线圈）；位置寄存器 HR120（低 16 位）+ HR121（高 16 位）组成 32 位 DINT，FC03 读 / FC10 一次原子写',
        '• Siemens S7：S7-1200/1500/300/400，布尔 IO 在 M0.0~M31.6；位置取 M 区 MD120（网关地址 MDI120），按 32 位 DINT 读写',
        '• 三菱 MX Component：FX 系列经 GX Simulator 2 直连，布尔 IO 用 X0~X31 / Y0~Y16（八进制）；位置只取 D120 低字 + D121 高字，默认不接高速计数器',
      ],
    },
    {
      icon: '🧲',
      name: '电磁阀类型：单电控 / 双电控',
      color: 'orange',
      description: '控制气缸，实质是控制电磁阀',
      details: [
        '单电控（弹簧复位）：每个气缸一只动作线圈（C32~C36 / Y2~Y6 / M30.2~M30.6，详见输出信号表）。线圈得电 → 气缸到动作位（推药缸伸出、翻转缸倒药）；线圈失电 → 阀芯弹簧复位、气缸回原位。孪生按电平直接跟随，缩回线圈不参与。',
        '双电控（记忆型）：每个气缸两只线圈（动作 + 缩回，新增缩回线圈 C41~C45 / Y12~Y16 / M31.2~M31.6）。任一只线圈出现上升沿即切换阀芯；两线圈都断电时仍保持当前伸出 / 缩回状态，直到反向线圈再来一个上升沿。',
        '仿真面板「电磁阀类型」可实时切换，默认单电控：内置虚拟 PLC 参考程序按单电控编写（动作线圈 ON 伸出、OFF 缩回）。切到双电控后 PLC 程序必须额外输出缩回脉冲，否则气缸不会回位——这正是两种阀在编程上的区别。',
        '同一气缸两只线圈同时得电属禁止状态：真实双电控阀不允许两端同时通电，孪生保持原姿态并在仿真面板给出红色提示。',
        '既有 32~40 地址一个都不改，新增缩回线圈只占 41~45（37 为历史预留空洞），因此既有 PLC 程序、地址浮框与地址表仍然有效。',
        '观众端跟随的是主控 3D 模型的实际姿态快照，不是线圈电平：双电控脉冲断电后观众画面仍保持伸出 / 翻转状态，不会错误回位。',
      ],
    },
    {
      icon: '📐',
      name: '原点/终点传感器与位置寄存器',
      color: 'green',
      description: '32 位 DINT 位置反馈',
      details: [
        '原点、终点各装一个接近开关，滑台进入 ±5mm 窗口即触发（离开用 ±15mm，滞回防抖）。3D 机架上可见开关本体与状态 LED。',
        `${ENCODER_REG_LABEL} 组成 32 位有符号 DINT：增量式编码器 ${ENCODER_PULSES_PER_REV} 脉冲/转 × 丝杆导程 ${SCREW_DETAIL.LEAD * 1000}mm/转 = ${PULSES_PER_M} 脉冲/m（1 脉冲 ≈ ${PULSE_LENGTH_MM.toFixed(4)}mm），1.70m 行程计数 0~${ENCODER_PULSES_MAX}（已跨 16 位，必须双字）；滑台前进递增、后退递减，不是绝对坐标直写。`,
        '增量式编码器没有绝对零点：只有回到原点传感器（Z 相）才把寄存器校准归零。',
        '设备口径：驱动端是普通正反转电机，PLC 只有「电机正转 / 电机反转」两个布尔输出点，不是伺服——没有伺服使能 / 报警 / 就绪，也没有 LREAL velocity 速度给定；速度由电源与减速比开环决定，位置闭环全靠编码器反馈。',
        '编码器是独立外置件，装在 +X 丝杆末端浮动轴承座外侧（终点限位 / 翻转位 / 取药仓同侧），经弹性联轴器与丝杆轴伸相连，本体由 L 型支架固定不随轴转；测丝杆转角可避开联轴器与传动间隙误差，不是电机尾部集成件。',
        '编码器与丝杆之间用的是小型波纹管弹性联轴器（两端铝合金夹紧轮毂 + 中间不锈钢薄壁波纹管 + 径向夹紧螺钉），只传角度不传扭矩、零背隙低惯量，可补偿两轴的径向 / 角向 / 轴向偏差；它不是 -X 电机侧那副传扭矩的大号梅花联轴器，更不是刚性直连。编码器输入轴穿过前端夹紧法兰的中心孔，法兰带 3 个安装孔并锁在 L 型支架上，本体静止不随轴转。',
        '真实设备侧：编码器 A/B 相两条线接 X0/X1、由高速计数器 C0 计数，PLC 程序把 C0 当前值映射/缩放到该 DINT 寄存器；数字孪生不绑定物理输入点，也不模拟高速脉冲。',
        '3D 核对：右上角机位选「轴末端」看整机同侧关系，或部件展台下拉选「轴末端编码器」以 1:1 真实尺度看「浮动端轴承座 → 丝杆轴伸 → 波纹管联轴器 → 编码器输入轴 → 带孔夹紧法兰 → 静止本体 → A/B 相分色出线」；展台左上角标注局部原点为浮动端轴承座 +X 端面与丝杆轴线的交点，本体上的琥珀亮点是 Z 相零位标记。',
        '网关为数值变量单开 read-words / write-words 通道：Modbus 用 FC10 一次写两个字，S7 写 MDI120，三菱写 D120/D121；不会像逐位线圈那样出现撕裂值。',
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
        hint: '面板上悬停（或键盘聚焦）「启动」「A 缸后」「滑台」等信号名称，浮框会一次给出该点的三菱 X/Y、Modbus 线圈号与 Siemens S7 M 区地址；本表是完整映射。',
      },
      {
        title: '输出信号（PLC → 孪生）',
        icon: '📤',
        rows: toRows(OUTPUT_SIGNALS),
        hint: '前 10 行是动作输出，后 5 行是双电控专用的缩回 / 回位线圈（单电控不使用）。按钮与传感器是布尔量，由孪生实时写入；位置是数值量，走 32 位 DINT 数据寄存器，不占输入点。三菱 X/Y 为八进制编号，Modbus 线圈地址从 0 开始。',
      },
      {
        title: '数据寄存器（孪生 → PLC）',
        icon: '📐',
        rows: [{
          name: '增量式编码器当前值（DINT32）',
          addressCells: [ENCODER_DINT.MODBUS_LABEL, ENCODER_DINT.S7_LABEL, ENCODER_DINT.MITSUBISHI_LABEL],
          description: `32 位有符号整数，低字在前。原点=0，前进 +、后退 -，回原点传感器（Z 相）归零；${ENCODER_PULSES_PER_REV} 脉冲/转 × ${SCREW_DETAIL.LEAD * 1000}mm 导程 = ${PULSES_PER_M} 脉冲/m，行程 0~${ENCODER_PULSES_MAX}。不占用线圈或 X 输入点。`,
        }],
        hint: 'A/B 相接线与高速计数器 C0 由 PLC 程序负责；三菱侧默认不使用高速计数器，只取 D 寄存器。虚拟 PLC 以该 DINT 作为位置闭环真值，独立运行时自动退回内部积分。',
      },
    ],
  },
});
