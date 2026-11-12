/**
 * 场景仿真地址表（单一来源）
 *
 * - COAL_ADDRESSES          煤料分拣场景（线圈 0-26）
 * - DISPENSING_ADDRESSES    自动配药场景（线圈 0-45，全部是布尔量；41-45 是双电控缩回线圈）
 * - DISPENSING_WORDS        自动配药位置寄存器（32 位 DINT，不占线圈/输入点）
 *
 * ⚠️ 同步规则：修改前端 constants.ts 地址后，必须同步本文件；
 * 运行 `node mock-addresses.js --check` 可对照 constants.ts 做一致性检查。
 */

/** 煤料分拣 IO 地址（Modbus 线圈号，与前端 constants 一致） */
const COAL_ADDRESSES = {
  BUTTON_START: 0, BUTTON_STOP: 1, BUTTON_ESTOP: 2,
  BELT1_RUN: 3, BELT2_RUN: 4, BELT3_RUN: 5, BELT4_RUN: 6,
  FEED_CYL_EXTEND: 7, FEED_CYL_RETRACT: 8, SEPARATOR_ON: 9,
  S1_BELT1_ENTRY: 10, S2_BELT1_RUN: 11, S3_BELT1_EXIT: 12,
  S4_BELT2_ENTRY: 13, S5_BELT2_RUN: 14, S6_BELT2_EXIT: 15,
  S7_BELT3_ENTRY: 16, S8_BELT3_RUN: 17, S9_BELT3_EXIT: 18,
  S10_PILEUP: 19,
  CYL_FEED_OUT: 20, CYL_FEED_IN: 21,
  IND_BELT1_RUN: 22, IND_BELT2_RUN: 23, IND_BELT3_RUN: 24, IND_BELT4_RUN: 25,
  IND_FAULT: 26,
};

/** 自动配药 IO 地址（Modbus 线圈号，与前端 constants 一致）；只放布尔量 */
const DISPENSING_ADDRESSES = {
  BUTTON_START: 0, BUTTON_STOP: 1, BUTTON_RESET: 2, BUTTON_ESTOP: 3, BUTTON_CONFIRM: 4,
  SEL_MANUAL: 5, SEL_AUTO: 6,
  S_LIMIT_START: 10, S_LIMIT_END: 11,
  S_MAG_A_EMPTY: 12, S_MAG_B_EMPTY: 13, S_MAG_C_EMPTY: 14, S_MAG_D_EMPTY: 15,
  S_BIN_HAS_DRUG: 16,
  MSC_A_BACK: 20, MSC_A_FRONT: 21,
  MSC_B_BACK: 22, MSC_B_FRONT: 23,
  MSC_C_BACK: 24, MSC_C_FRONT: 25,
  MSC_D_BACK: 26, MSC_D_FRONT: 27,
  MSC_TILT_HOLD: 28, MSC_TILT_DUMP: 29,
  MOTOR_FWD: 30, MOTOR_REV: 31,
  CYL_SEND_A: 32, CYL_SEND_B: 33, CYL_SEND_C: 34, CYL_SEND_D: 35, CYL_TILT: 36,
  LAMP_GREEN: 38, LAMP_YELLOW: 39, LAMP_RED: 40,
  // 双电控专用「缩回 / 回位」线圈 41-45：既有 32-40 编号一个都不动，
  // 单电控（弹簧复位）不使用；37 是历史预留空洞，继续空置。
  CYL_SEND_A_RETRACT: 41, CYL_SEND_B_RETRACT: 42, CYL_SEND_C_RETRACT: 43,
  CYL_SEND_D_RETRACT: 44, CYL_TILT_RETRACT: 45,
};

/**
 * 自动配药位置寄存器：一个 32 位有符号 DINT，与前端 MODBUS_HOLDING_REGISTERS 同源。
 * 增量式编码器脉冲计数，随滑台前进 +、后退 -，回原点传感器（Z 相）归零。
 * 物理 A/B 相接 X0/X1、高速计数器 C0 的映射由 PLC 程序负责，孪生不占输入点。
 */
const DISPENSING_REGISTERS = {
  ENCODER_PULSES: 120,
};

/**
 * 位置寄存器的协议地址表（32 位 DINT，低字在前）。
 * - modbus: HR120 低 16 位 / HR121 高 16 位，FC03 读、FC10 一次原子写；
 * - s7: MDI120 是 nodes7 的 M 区 32 位 DINT（用户可见地址为 MD120），原生数值读写；
 * - mitsubishi: D120 低 16 位 / D121 高 16 位，默认不接高速计数器，只取 D 寄存器。
 */
const DISPENSING_WORDS = {
  ENCODER_PULSES: {
    type: 'dint32',
    wordOrder: 'low-first',
    modbus: { address: 120, words: 2 },
    s7: { address: 'MDI120', words: 1 },
    mitsubishi: { address: 'D120', words: 2 },
  },
};

/**
 * MD520 变频器 485 专用参数通信地址（16 位单字，与配药 DINT 完全分离）。
 * 依据《MD520系列通用变频器通信手册-CN-B03》2.3 表 2-1/2-2。
 * 十进制书写，与前端 constants/md520-addresses.ts 及 shared CONNECT_WORDS 三处同源。
 */
const VFD_REGISTERS = {
  VFD_SETPOINT: 4096,     // 1000H 通信设定值（±100.00%，相对最大频率）
  VFD_RUN_FREQ: 4097,     // 1001H 运行频率（0.01Hz）
  VFD_DI_FLAGS: 4104,     // 1008H DI 端子标志（PLC DO → 变频器 DI）
  VFD_DO_FLAGS: 4105,     // 1009H DO 输出标志（变频器 DO → PLC DI）
  VFD_AI1: 4106,          // 100AH AI1 数值镜像（0.01V/字，PLC AO 输出）
  VFD_COMMAND2: 8192,     // 2000H 控制命令2
  VFD_DO_CONTROL: 8193,   // 2001H DO 端子控制
  VFD_AO1: 8194,          // 2002H AO1
  VFD_STATUS1: 12288,     // 3000H 状态1
  VFD_FREQ2: 29456,       // 7310H 通信设定频率2（0.01Hz）
  VFD_COMMAND1: 29457,    // 7311H 控制命令1
  VFD_STATUS2: 28740,     // 7044H 状态2
  VFD_PARAM_F0_02: 61442, // F002H 运行指令选择（面板写 → PLC 读）
  VFD_PARAM_F0_03: 61443, // F003H 主频率源（面板写 → PLC 读）
  VFD_PARAM_F0_10: 61450, // F00AH 最大频率（面板写 → PLC 读）
};

const VFD_WORDS = Object.fromEntries(
  Object.entries(VFD_REGISTERS).map(([name, address]) => [
    name, { type: 'uint16', modbus: { address, words: 1 } },
  ]),
);

/**
 * 编码器 / 丝杆 / 速度换算尺度（网关侧单一来源）。
 *
 * 增量式编码器 1024 脉冲/转（A/B 相 → PLC 高速计数器 C0），丝杆导程 20mm/转：
 *   1m 行程 = 1024 / 0.020 = 51200 脉冲（1 脉冲 ≈ 0.0195mm）
 *   1.70m 有效行程 = 87040 脉冲 > 65535，必须由两个 16 位字（32 位 DINT）承载。
 * 前端 constants.ts 的同名常量与虚拟 PLC 都不得另写一套数值，由 --check 校验。
 */
const ENCODER_SCALE = {
  PULSES_PER_REV: 1024,
  LEAD_M: 0.020,
  SLIDER_SPEED: 0.45,
  POSITION_TOL_M: 0.040,
  SLIDER_MIN_M: 0.25,
  SLIDER_MAX_M: 1.95,
};
ENCODER_SCALE.PULSES_PER_M = ENCODER_SCALE.PULSES_PER_REV / ENCODER_SCALE.LEAD_M;
ENCODER_SCALE.START_PULSE = Math.round(ENCODER_SCALE.SLIDER_MIN_M * ENCODER_SCALE.PULSES_PER_M);
ENCODER_SCALE.PULSES_MAX = Math.round(
  (ENCODER_SCALE.SLIDER_MAX_M - ENCODER_SCALE.SLIDER_MIN_M) * ENCODER_SCALE.PULSES_PER_M,
);
ENCODER_SCALE.POSITION_TOL_PULSES = Math.round(
  ENCODER_SCALE.POSITION_TOL_M * ENCODER_SCALE.PULSES_PER_M,
);

/** 对照前端 constants.ts 做一致性检查（text 正则解析，仅数字型线圈映射） */
function checkSceneAgainstConstants(scene, addrMap, constPath, blockName) {
  const fs = require('fs');
  const path = require('path');
  const target = path.join(__dirname, constPath);
  if (!fs.existsSync(target)) {
    console.error(`[check][${scene}] 未找到前端常量文件: ${target}`);
    return false;
  }
  const src = fs.readFileSync(target, 'utf8');
  const block = src.match(new RegExp(`${blockName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) {
    console.error(`[check][${scene}] 未找到 ${blockName} 块`);
    return false;
  }
  const parsed = {};
  const re = /^\s*([A-Z0-9_]+):\s*(\d+),?\s*(\/\/.*)?$/gm;
  let m;
  while ((m = re.exec(block[1])) !== null) parsed[m[1]] = parseInt(m[2], 10);
  const keys = Object.keys(addrMap);
  const missing = keys.filter((k) => !(k in parsed));
  const mismatched = keys.filter((k) => (k in parsed) && parsed[k] !== addrMap[k]);
  const extra = Object.keys(parsed).filter((k) => !(k in addrMap));
  if (missing.length || mismatched.length || extra.length) {
    console.error(`[check][${scene}] ❌ 地址不一致：`);
    if (missing.length) console.error('  mock 有而 constants 缺:', missing.join(', '));
    if (mismatched.length) console.error('  地址不同:', mismatched.map((k) => `${k}: mock=${addrMap[k]} constants=${parsed[k]}`).join(', '));
    if (extra.length) console.error('  constants 有而 mock 缺:', extra.join(', '));
    return false;
  }
  console.log(`[check][${scene}] ✅ 地址一致（${keys.length} 项）`);
  return true;
}

/** 前端 ENCODER_DINT 表必须与网关 DISPENSING_WORDS 一致，且 8 位线圈镜像已彻底移除 */
function checkDintWords(constPath) {
  const fs = require('fs');
  const path = require('path');
  const target = path.join(__dirname, constPath);
  if (!fs.existsSync(target)) {
    console.error(`[check][dispensing-dint] ❌ 未找到前端常量文件: ${target}`);
    return false;
  }
  const src = fs.readFileSync(target, 'utf8');
  const d = DISPENSING_WORDS.ENCODER_PULSES;
  const required = [
    `MODBUS_ADDRESS: ${d.modbus.address}`,
    `S7_ADDRESS: '${d.s7.address}'`,
    `MITSUBISHI_ADDRESS: '${d.mitsubishi.address}'`,
    `WORDS: ${d.modbus.words}`,
    `WORD_ORDER: '${d.wordOrder}'`,
    `TYPE: '${d.type.toUpperCase()}'`,
  ];
  const missing = required.filter((token) => !src.includes(token));
  const legacy = /ENCODER_BIT\d/.test(src);
  if (missing.length || legacy) {
    console.error('[check][dispensing-dint] ❌ 32 位 DINT 口径不一致：');
    if (missing.length) console.error('  前端 ENCODER_DINT 缺:', missing.join(' | '));
    if (legacy) console.error('  前端 constants.ts 仍残留 ENCODER_BIT0..7 线圈镜像');
    return false;
  }
  console.log('[check][dispensing-dint] ✅ 三协议 DINT 地址一致，且无编码器位线圈');
  return true;
}

/** 网关侧 DINT 纯函数用固定向量自检，防止拆字/合并逻辑被改坏 */
function checkDintCodec() {
  const { DINT_TEST_VECTORS, splitDint32, joinDint32, toSigned16, toUnsigned16 } = require('./dint32');
  let ok = true;
  DINT_TEST_VECTORS.forEach(({ value, words }) => {
    const got = splitDint32(value);
    if (got[0] !== words[0] || got[1] !== words[1]) ok = false;
    if (joinDint32(words[0], words[1]) !== value) ok = false;
    if (toUnsigned16(toSigned16(words[0])) !== words[0]) ok = false;
    if (toUnsigned16(toSigned16(words[1])) !== words[1]) ok = false;
  });
  console.log(`[check][dint32] ${ok ? '✅' : '❌'} ${DINT_TEST_VECTORS.length} 组 32 位拆字/合并向量`);
  return ok;
}

/**
 * 网关 / 虚拟 PLC / 主控上报 / 纯中继 / 前端的数值通道必须齐全。
 * 2026-11-08 架构变更：PLC 只由主控连接，中继改为纯扇出，不再自行 read-words；
 * 观众端的位置数值来自主控 UI store 的 exportSnapshot，演示模式同样可同步。
 */
function checkDintGateway() {
  const fs = require('fs');
  const path = require('path');
  const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const server = read('server.js');
  const mockPlc = read('mock-dispensing-server.js');
  const broadcast = read('broadcast.js');
  const shell = read('../packages/platform/src/WorkspaceShell.tsx');
  const edge = read('edge-broadcast.json');
  const sim = read('../packages/auto-dispensing/src/scenes/auto-dispensing/panels/DispenseSimPanel.tsx');
  const viewer = read('../packages/auto-dispensing/src/index.ts');
  const required = [
    [server, "case 'read-words'", '网关 read-words'],
    [server, "case 'write-words'", '网关 write-words'],
    [server, '0x03', 'Modbus FC03'],
    [server, '0x10', 'Modbus FC10'],
    [server, 'wordVariables', 'connect 下发 wordVariables'],
    [mockPlc, 'setRegisterArray', '虚拟 PLC FC16 原子写'],
    [shell, "type: 'report'", '主控上报状态快照'],
    [shell, 'exportSnapshot', '主控导出 UI store 渲染态'],
    [broadcast, "msg.type === 'report'", '中继只接收主控上报'],
    [broadcast, 'lastSnapshot', '中继缓存最新快照'],
    [edge, '"wordVars"', '广播配置 wordVars'],
    [sim, "writeWord('ENCODER_PULSES'", '仿真面板写 DINT'],
    [viewer, "v['ENCODER_PULSES']", '观众端读数值'],
    [viewer, 'ENCODER_PULSES: s.encoderPulses', '位置数值来自主控 store'],
    [viewer, 'Number.isFinite(encoderValue)', '快照缺字段时保留位置'],
  ];
  const missing = required.filter(([src, token]) => !src.includes(token)).map(([, , name]) => name);
  const legacy = [mockPlc, edge, sim, viewer].some((src) => /ENCODER_BIT\d/.test(src));
  // 防回退：纯中继不得再连网关 / 自行轮询 PLC，否则主控不再是唯一 PLC 客户端
  const relayBridgeBack = /(startBridge|bridgeRequest|config\.bridgeUrl|pollLoop)/.test(broadcast);
  if (missing.length || legacy || relayBridgeBack) {
    console.error('[check][dint-chain] ❌ 32 位 DINT 链路不完整：');
    if (missing.length) console.error('  缺:', missing.join(' | '));
    if (legacy) console.error('  虚拟 PLC / 广播 / 面板 / 观众端仍残留 ENCODER_BIT 线圈镜像');
    if (relayBridgeBack) console.error('  状态中继仍在连接 PLC 网关 / 自行轮询数值');
    return false;
  }
  console.log(`[check][dint-chain] ✅ ${required.length} 处数值通道齐全，且无线圈镜像回流`);
  return true;
}

/** 编码器尺度：前端常量、虚拟 PLC、端到端脚本必须与 ENCODER_SCALE 同源 */
function checkEncoderScale() {
  const fs = require('fs');
  const path = require('path');
  const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const front = read('../packages/auto-dispensing/src/scenes/auto-dispensing/constants.ts');
  const mockPlc = read('mock-dispensing-server.js');
  const e2e = read('test-dispensing-encoder.js');
  const required = [
    [front, `ENCODER_PULSES_PER_REV = ${ENCODER_SCALE.PULSES_PER_REV}`, '前端编码器分辨率'],
    [front, `LEAD: ${ENCODER_SCALE.LEAD_M.toFixed(3)}`, '前端丝杆导程'],
    [front, `SLIDER_SPEED: ${ENCODER_SCALE.SLIDER_SPEED}`, '前端演示速度'],
    [front, `SLIDER_MIN_X = ${ENCODER_SCALE.SLIDER_MIN_M}`, '前端行程下限'],
    [front, `SLIDER_MAX_X = ${ENCODER_SCALE.SLIDER_MAX_M}`, '前端行程上限'],
    [front, 'ENCODER_PULSES_PER_REV / SCREW_DETAIL.LEAD', '前端脉冲换算同源'],
    [mockPlc, 'ENCODER_SCALE', '虚拟 PLC 引用共享尺度'],
    [e2e, 'ENCODER_SCALE', '端到端脚本引用共享尺度'],
  ];
  const missing = required.filter(([src, token]) => !src.includes(token)).map(([, , name]) => name);
  const valid = ENCODER_SCALE.PULSES_PER_M === ENCODER_SCALE.PULSES_PER_REV / ENCODER_SCALE.LEAD_M
    && ENCODER_SCALE.PULSES_MAX > 0xffff
    && ENCODER_SCALE.PULSES_MAX < 2 ** 31;
  if (missing.length || !valid) {
    console.error('[check][encoder-scale] ❌ 编码器尺度不一致：');
    if (missing.length) console.error('  缺:', missing.join(' | '));
    if (!valid) console.error('  脉冲换算或 32 位边界不成立');
    return false;
  }
  console.log(`[check][encoder-scale] ✅ ${ENCODER_SCALE.PULSES_PER_REV} 脉冲/转 ÷ ${ENCODER_SCALE.LEAD_M}m/转 = ${ENCODER_SCALE.PULSES_PER_M} 脉冲/m，行程 0~${ENCODER_SCALE.PULSES_MAX}（跨 16 位），速度 ${ENCODER_SCALE.SLIDER_SPEED} m/s`);
  return true;
}

/**
 * 观众端隔离（2026-11-08）：观众是只读镜像，只允许订阅 /ws/relay，
 * 绝不建立 /ws/plc 通道。各设备 plcService 是模块级单例，构造时就会连网关，
 * 因此每个服务都必须在连接入口带 canOpenPlcChannel() 守卫。
 */
function checkViewerIsolation() {
  const fs = require('fs');
  const path = require('path');
  const read = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8');
  const services = [
    'packages/auto-dispensing/src/services/plc-websocket.ts',
    'packages/coal-sorting/src/services/plc-websocket.ts',
    'packages/pneumatic-robot/src/services/plc-websocket.ts',
    'packages/traffic-light/src/services/plc-websocket.ts',
    'packages/shared/src/services/modbus-websocket.ts',
  ];
  const endpoints = read('../packages/shared/src/services/wsEndpoints.ts');
  const barrel = read('../packages/shared/src/index.ts');
  const viewer = read('../packages/platform/src/ViewerWorkspace.tsx');
  const required = [
    [endpoints, 'return !isViewerRuntime()', 'PLC 通道开关按运行角色判定'],
    [barrel, 'canOpenPlcChannel', '总入口导出通道开关'],
    [viewer, 'relayWsUrl()', '观众只连状态中继'],
    ...services.map((rel) => [
      read(`../${rel}`), 'if (!canOpenPlcChannel()) return;', `${rel} 观众端守卫`,
    ]),
  ];
  const missing = required.filter(([src, token]) => !src.includes(token)).map(([, , name]) => name);
  const forbidden = [
    [viewer, /new WebSocket\(plcWsUrl\(\)\)/, '观众端自建 PLC 连接'],
    [viewer, /type:\s*['"]set-device['"]|sendSetDevice\s*\(/, '观众端反向切换设备'],
    [endpoints, /location\.hostname.*8081/, '端点又拼回跨端口直连'],
  ].filter(([src, re]) => re.test(src)).map(([, , name]) => name);
  if (missing.length || forbidden.length) {
    console.error('[check][viewer-isolation] ❌ 观众端隔离不完整：');
    if (missing.length) console.error('  缺:', missing.join(' | '));
    if (forbidden.length) console.error('  禁止:', forbidden.join(' | '));
    return false;
  }
  console.log(`[check][viewer-isolation] ✅ ${services.length} 个 PLC 服务带观众端守卫，观众零上行且不建 PLC 通道`);
  return true;
}

/** MD520 485 单字链路：前端地址表 / shared 数值通道 / 网关单字分支 / conveyor 虚拟 PLC / 观众快照 */
function checkVfdChain() {
  const fs = require('fs');
  const path = require('path');
  const targets = {
    spec: '../packages/md520-vfd/src/constants/md520-addresses.ts',
    shared: '../packages/shared/src/services/modbus-websocket.ts',
    server: './server.js',
    mockPlc: './mock-vfd-server.js',
    index: '../packages/md520-vfd/src/index.ts',
    link: '../packages/md520-vfd/src/platform/VfdLink.tsx',
  };
  const required = [
    [targets.spec, 'VFD_SETPOINT: 4096'],
    [targets.spec, 'VFD_COMMAND2: 8192'],
    [targets.spec, 'VFD_STATUS1: 12288'],
    [targets.spec, 'VFD_FREQ2: 29456'],
    [targets.spec, 'VFD_AI1: 4106'],
    [targets.spec, 'VFD_PARAM_F0_02: 61442'],
    [targets.shared, 'CONNECT_WORDS'],
    [targets.shared, 'readWords'],
    [targets.shared, 'writeWord'],
    [targets.server, "'uint16'"],
    [targets.server, 'spec.type ==='],
    [targets.mockPlc, 'isVfdAddress'],
    [targets.mockPlc, 'vfdPlcScan'],
    [targets.link, 'VFD_DI_FLAGS'],
    [targets.link, 'VFD_AI1'],
    [targets.link, 'VFD_PARAM_F0_02'],
    [targets.index, 'VFD_OUTPUT_HZ'],
  ];
  const cache = new Map();
  const textOf = (file) => {
    if (!cache.has(file)) cache.set(file, fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
    return cache.get(file);
  };
  for (const [file, token] of required) {
    const abs = path.resolve(__dirname, file);
    if (!fs.existsSync(abs)) {
      console.error(`[check][md520] ❌ 缺文件 ${file}`);
      return false;
    }
    if (!textOf(file).includes(token)) {
      console.error(`[check][md520] ❌ ${file} 缺 ${token}`);
      return false;
    }
  }
  const words = Object.values(VFD_WORDS);
  if (words.some((w) => w.type !== 'uint16' || w.modbus.words !== 1)) {
    console.error('[check][md520] ❌ VFD_WORDS 必须全部是单字 uint16');
    return false;
  }
  // 三处地址表必须逐键等值，避免新增寄存器只改了一处造成静默读写越界
  for (const [name, address] of Object.entries(VFD_REGISTERS)) {
    const pairs = [
      [targets.spec, `${name}: ${address}`],
      [targets.shared, `${name}: { type: 'uint16', modbus: { address: ${address}, words: 1 }`],
    ];
    for (const [file, token] of pairs) {
      if (!textOf(file).includes(token)) {
        console.error(`[check][md520] ❌ ${file} 缺 ${token}`);
        return false;
      }
    }
  }
  console.log(`[check][md520] ✅ 485 单字链路 ${required.length} 处接线齐全，${words.length} 个专用寄存器三处同源`);
  return true;
}

/**
 * 场景独立：MD520 变频器是独立设备场景，拥有自己的虚拟 PLC :1507。
 * 已定稿的自动配药 PLC 与传送带分拣 PLC 都不得残留任何变频器寄存器 / 从站逻辑；
 * 三个 PLC 各绑回环、各由 start:lab 独立启动，端口互不相同。
 */
function checkVfdIsolation() {
  const fs = require('fs');
  const path = require('path');
  const readFile = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  const dispensing = readFile('./mock-dispensing-server.js');
  const conveyor = readFile('./mock-conveyor-server.js');
  const vfd = readFile('./mock-vfd-server.js');
  const startLab = readFile('../scripts/start-lab.cjs');
  const registry = readFile('../packages/platform/src/registry.ts');
  const forbidden = ['isVfdAddress', 'vfdWords', 'VFD_ADDR_MIN', 'MD520', 'VFD_REGISTERS', 'vfdPlcScan'];
  for (const [name, source] of [['自动配药 PLC', dispensing], ['传送带分拣 PLC', conveyor]]) {
    const leaked = forbidden.filter((t) => source.includes(t));
    if (leaked.length) {
      console.error(`[check][vfd-isolation] ❌ ${name} 残留变频器逻辑: ${leaked.join(', ')}`);
      return false;
    }
  }
  const vfdNeed = ['vfdPlcScan', 'isVfdAddress', 'VFD_REGISTERS', "host: '127.0.0.1'", 'setRegisterArray'];
  for (const token of vfdNeed) {
    if (!vfd.includes(token)) {
      console.error(`[check][vfd-isolation] ❌ MD520 虚拟 PLC 缺 ${token}`);
      return false;
    }
  }
  const vfdForbidden = ['ENCODER_PULSES', 'recipe', 'MAGA_PULSE', 'DISPENSING_ADDRESSES', 'SORT1_CTRL'];
  const mixed = vfdForbidden.filter((t) => vfd.includes(t));
  if (mixed.length) {
    console.error(`[check][vfd-isolation] ❌ MD520 虚拟 PLC 混入其它场景逻辑: ${mixed.join(', ')}`);
    return false;
  }
  if (!startLab.includes('mock-vfd-server.js') || !startLab.includes('VFD_PLC_PORT = 1507')) {
    console.error('[check][vfd-isolation] ❌ start-lab.cjs 未启动 MD520 独立虚拟 PLC :1507');
    return false;
  }
  if (!registry.includes('md520VfdDevice')) {
    console.error('[check][vfd-isolation] ❌ 平台壳未注册 MD520 独立设备');
    return false;
  }
  console.log('[check][vfd-isolation] ✅ 变频器只在独立设备场景 :1507，配药 / 分拣 PLC 零耦合');
  return true;
}

/**
 * 三协议 uint16 单字通道：CONNECT_WORDS 的 modbus / s7 / mitsubishi 三处同源，
 * connect 三个协议分支都下发 wordVariables，网关 S7 与三菱按 spec.type 分流读写。
 */
function checkWordProtocolChain() {
  const fs = require('fs');
  const path = require('path');
  const readFile = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  const shared = readFile('../packages/shared/src/services/modbus-websocket.ts');
  const spec = readFile('../packages/md520-vfd/src/constants/md520-addresses.ts');
  const server = readFile('./server.js');
  // 设备可用 config.wordVariables 覆盖默认表，但三个协议分支都必须下发（默认兜底不可省）
  const frames = (shared.match(/wordVariables: (?:config\.wordVariables \?\? )?CONNECT_WORDS/g) || []).length;
  if (frames !== 3) {
    console.error(`[check][word-protocol] ❌ connect 三个协议分支都须下发 wordVariables，实际 ${frames}`);
    return false;
  }
  if (!shared.includes('wordVariables?: Record<string, WordVariableSpec>')) {
    console.error('[check][word-protocol] ❌ 缺设备自定义单字变量表口子');
    return false;
  }
  for (const [name, address] of Object.entries(VFD_REGISTERS)) {
    const m = spec.match(new RegExp(`${name}: \\{ s7: '(\\w+)', mitsubishi: '(D\\d+)' \\}`));
    if (!m) {
      console.error(`[check][word-protocol] ❌ 前端协议地址表缺 ${name}`);
      return false;
    }
    const token = `${name}: { type: 'uint16', modbus: { address: ${address}, words: 1 }, s7: { address: '${m[1]}', words: 1 }, mitsubishi: { address: '${m[2]}', words: 1 } }`;
    if (!shared.includes(token)) {
      console.error(`[check][word-protocol] ❌ shared 缺 ${token}`);
      return false;
    }
  }
  const need = [
    "spec && spec.type === 'uint16' ? toUnsigned16(v) : clampDint32(v)",
    "return spec.type === 'uint16' ? [`D${base}`] :",
    "spec?.type === 'uint16'",
    "word && word.s7 && word.s7.address",
  ];
  for (const token of need) {
    if (!server.includes(token)) {
      console.error(`[check][word-protocol] ❌ 网关缺 ${token}`);
      return false;
    }
  }
  console.log(`[check][word-protocol] ✅ 三协议 uint16 单字链路 ${Object.keys(VFD_REGISTERS).length} 个寄存器同源`);
  return true;
}

/**
 * B 档真实 485 主从：独立纯从站 :1508 + 真实 Modbus 主站轮询进程，
 * 与三个场景 PLC 端口隔离、寄存器区独立、已定稿场景零残留。
 */
function checkVfd485Slave() {
  const fs = require('fs');
  const path = require('path');
  const readFile = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  let slave, master, startLab, dispensing, conveyor;
  try {
    slave = readFile('./mock-vfd-slave.js');
    master = readFile('./vfd-485-master.cjs');
    startLab = readFile('../scripts/start-lab.cjs');
    dispensing = readFile('./mock-dispensing-server.js');
    conveyor = readFile('./mock-conveyor-server.js');
  } catch (e) {
    console.error(`[check][vfd-485] ❌ B 档文件缺失: ${e.message}`);
    return false;
  }
  const slaveNeed = ['VFD_REGISTERS', "host: '127.0.0.1'", 'setRegisterArray', 'pure-slave', 'isVfdAddress'];
  for (const token of slaveNeed) {
    if (!slave.includes(token)) {
      console.error(`[check][vfd-485] ❌ 独立从站缺 ${token}`);
      return false;
    }
  }
  if (slave.includes('vfdPlcScan') || slave.includes('setInterval(vfdPlcScan')) {
    console.error('[check][vfd-485] ❌ 独立从站混入 PLC 参考程序，必须是纯从站');
    return false;
  }
  const masterNeed = ['connectTCP', 'writeRegister(', 'writeCoils(', 'readHoldingRegisters(', 'readCoils(', 'VFD_REGISTERS'];
  for (const token of masterNeed) {
    if (!master.includes(token)) {
      console.error(`[check][vfd-485] ❌ 主站轮询缺真实帧 ${token}`);
      return false;
    }
  }
  const labNeed = ['VFD_SLAVE_PORT = 1508', 'mock-vfd-slave.js', 'vfd-485-master.cjs',
    'portBusy(VFD_SLAVE_PORT)', 'DT_VFD_485_MASTER'];
  for (const token of labNeed) {
    if (!startLab.includes(token)) {
      console.error(`[check][vfd-485] ❌ start-lab.cjs 缺 ${token}`);
      return false;
    }
  }
  for (const [name, source] of [['自动配药 PLC', dispensing], ['传送带分拣 PLC', conveyor]]) {
    if (source.includes('VFD_SLAVE') || source.includes('mock-vfd-slave')) {
      console.error(`[check][vfd-485] ❌ ${name} 残留 B 档从站逻辑`);
      return false;
    }
  }
  console.log('[check][vfd-485] ✅ B 档独立从站 :1508 + 真实主站轮询，端口与场景隔离');
  return true;
}

/**
 * 汇川龙门 XY 象棋分拣场景隔离：新设备包独立注册、五处接线齐全、
 * 变量表单一来源、ETHERCAT 只是映射声明，已定稿场景零龙门残留。
 */
function checkGantryIsolation() {
  const fs = require('fs');
  const path = require('path');
  const readFile = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  let registry, vars, sceneIdx;
  try {
    registry = readFile('../packages/platform/src/registry.ts');
    vars = readFile('../packages/inovance-gantry/src/constants/gantryVariables.ts');
    sceneIdx = readFile('../packages/inovance-gantry/src/index.ts');
  } catch (e) {
    console.error(`[check][gantry-isolation] ❌ 龙门场景文件缺失: ${e.message}`);
    return false;
  }
  if (!registry.includes('inovanceGantryDevice')) {
    console.error('[check][gantry-isolation] ❌ 平台壳未注册汇川龙门设备');
    return false;
  }
  const wiring = [
    ['../packages/platform/package.json', '@digital-twin/inovance-gantry'],
    ['../packages/platform/vite.config.ts', "'@digital-twin/inovance-gantry'"],
    ['../packages/platform/tsconfig.app.json', '"@digital-twin/inovance-gantry"'],
    ['../packages/platform/src/index.css', '../../inovance-gantry/src'],
  ];
  for (const [file, token] of wiring) {
    if (!readFile(file).includes(token)) {
      console.error(`[check][gantry-isolation] ❌ ${file} 缺 ${token}`);
      return false;
    }
  }
  for (const token of ['GANTRY_X_POS_L', 'GANTRY_Y_POS_L', 'ETHERCAT_PDO_MAP', '仅声明，不实现链路']) {
    if (!vars.includes(token)) {
      console.error(`[check][gantry-isolation] ❌ 变量表缺 ${token}`);
      return false;
    }
  }
  if (/net\.Socket|createConnection|EtherCATMaster|writePdo/.test(vars)) {
    console.error('[check][gantry-isolation] ❌ ETHERCAT 映射表里出现底层链路实现');
    return false;
  }
  if (!sceneIdx.includes('exportSnapshot') || !sceneIdx.includes('applyBroadcast')) {
    console.error('[check][gantry-isolation] ❌ 龙门场景缺观众只读镜像');
    return false;
  }
  for (const scene of ['mock-dispensing-server.js', 'mock-conveyor-server.js', 'mock-vfd-server.js', 'mock-vfd-slave.js']) {
    const src = readFile(`./${scene}`);
    if (src.includes('GANTRY_') || src.includes('inovance-gantry')) {
      console.error(`[check][gantry-isolation] ❌ ${scene} 残留龙门变量`);
      return false;
    }
  }
  console.log('[check][gantry-isolation] ✅ 龙门场景独立注册、五处接线齐全、ETHERCAT 仅映射、其它场景零残留');
  return true;
}

/**
 * 汇川龙门仿真模式方案 A：独立虚拟 PLC :1509 / 状态口 :5089。
 * 锁死「启动编排 + 端口隔离 + 100ms 参考程序 + 前端 300ms 轮询 + 三协议地址表」五处同源，
 * 且已定稿的配药 / 分拣 / MD520 PLC 零龙门残留。
 */
function checkGantryPlc() {
  const fs = require('fs');
  const path = require('path');
  const readFile = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
  let plc, startLab, connection, effects, vars, panel;
  try {
    plc = readFile('./mock-gantry-server.js');
    startLab = readFile('../scripts/start-lab.cjs');
    connection = readFile('../packages/inovance-gantry/src/platform/GantryPlcConnection.tsx');
    effects = readFile('../packages/inovance-gantry/src/platform/GantryDeviceEffects.tsx');
    vars = readFile('../packages/inovance-gantry/src/constants/gantryVariables.ts');
    panel = readFile('../packages/inovance-gantry/src/platform/GantryPanelParts.tsx');
  } catch (e) {
    console.error(`[check][gantry-plc] ❌ 龙门仿真 PLC 文件缺失: ${e.message}`);
    return false;
  }
  const plcNeed = ["host: '127.0.0.1'", 'GANTRY_X_POS', 'GANTRY_PICK_CELL', 'GANTRY_PLACE_CELL',
    'gantryPlcScan', 'setInterval(gantryPlcScan, 100)', 'setRegisterArray', 'virtual-plc',
    '/status', 'externalPosUntil', 'MAIN_COMMANDS'];
  for (const token of plcNeed) {
    if (!plc.includes(token)) {
      console.error(`[check][gantry-plc] ❌ 虚拟 PLC 缺 ${token}`);
      return false;
    }
  }
  if (/EtherCATMaster|writePdo|net\.Socket/.test(plc)) {
    console.error('[check][gantry-plc] ❌ 虚拟 PLC 混入 EtherCAT 底层链路实现');
    return false;
  }
  const labNeed = ['GANTRY_PLC_PORT = 1509', 'GANTRY_HTTP_PORT = 5089',
    'mock-gantry-server.js', 'portBusy(GANTRY_PLC_PORT)', 'portBusy(GANTRY_HTTP_PORT)'];
  for (const token of labNeed) {
    if (!startLab.includes(token)) {
      console.error(`[check][gantry-plc] ❌ start-lab.cjs 缺 ${token}`);
      return false;
    }
  }
  for (const token of ['1509', 'GANTRY_WORD_VARIABLES', 'wordVariables']) {
    if (!connection.includes(token)) {
      console.error(`[check][gantry-plc] ❌ 连接面板缺 ${token}`);
      return false;
    }
  }
  for (const token of ['readWords(WORD_NAMES)', 'setPlcFrame', 'GANTRY_PHASE_W', 'GANTRY_PICK_CELL']) {
    if (!effects.includes(token)) {
      console.error(`[check][gantry-plc] ❌ effects 缺 ${token}`);
      return false;
    }
  }
  for (const token of ['GANTRY_X_POS', 'GANTRY_Y_TGT', 'GANTRY_HELD_W', 'GANTRY_PICK_CELL', 'GANTRY_PLACE_CELL']) {
    if (!vars.includes(token)) {
      console.error(`[check][gantry-plc] ❌ 字变量表缺 ${token}`);
      return false;
    }
  }
  if (!panel.includes('GANTRY_ADDRESS_ROWS')) {
    console.error('[check][gantry-plc] ❌ 变量地址表未引用 GANTRY_ADDRESS_ROWS');
    return false;
  }
  for (const token of ['信号', '三菱 FX', 'Modbus TCP', 'Siemens S7']) {
    if (!panel.includes(`<th`) || !panel.includes(token)) {
      console.error(`[check][gantry-plc] ❌ 变量地址表表头缺 ${token}`);
      return false;
    }
  }
  for (const scene of ['mock-dispensing-server.js', 'mock-conveyor-server.js',
    'mock-vfd-server.js', 'mock-vfd-slave.js']) {
    if (readFile(`./${scene}`).includes('GANTRY_')) {
      console.error(`[check][gantry-plc] ❌ ${scene} 残留龙门变量`);
      return false;
    }
  }
  console.log('[check][gantry-plc] ✅ 龙门虚拟 PLC :1509+5089 独立、启动接线齐、仿真面板与轮询同源');
  return true;
}

if (require.main === module && process.argv.includes('--check')) {
  const path = '../packages/auto-dispensing/src/scenes/auto-dispensing/constants.ts';
  let ok = true;
  ok = checkSceneAgainstConstants('coal', COAL_ADDRESSES,
    '../packages/coal-sorting/src/scenes/coal-sorting/constants.ts', 'MODBUS_READ_VARS') && ok;
  ok = checkSceneAgainstConstants('dispensing', DISPENSING_ADDRESSES, path, 'MODBUS_READ_VARS') && ok;
  ok = checkSceneAgainstConstants('dispensing-reg', DISPENSING_REGISTERS, path, 'MODBUS_HOLDING_REGISTERS') && ok;
  ok = checkDintWords(path) && ok;
  ok = checkDintCodec() && ok;
  ok = checkDintGateway() && ok;
  ok = checkEncoderScale() && ok;
  ok = checkViewerIsolation() && ok;
  ok = checkVfdChain() && ok;
  ok = checkVfdIsolation() && ok;
  ok = checkWordProtocolChain() && ok;
  ok = checkVfd485Slave() && ok;
  ok = checkGantryIsolation() && ok;
  ok = checkGantryPlc() && ok;
  process.exit(ok ? 0 : 1);
}

module.exports = {
  COAL_ADDRESSES, DISPENSING_ADDRESSES, DISPENSING_REGISTERS, DISPENSING_WORDS, ENCODER_SCALE,
  VFD_REGISTERS, VFD_WORDS,
};