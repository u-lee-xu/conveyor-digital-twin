/**
 * 场景仿真地址表（单一来源）
 *
 * - COAL_ADDRESSES          煤料分拣场景（线圈 0-26）
 * - DISPENSING_ADDRESSES    自动配药场景（线圈 0-47，含编码器 8 位）
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

/** 自动配药 IO 地址（Modbus 线圈号，与前端 constants 一致） */
const DISPENSING_ADDRESSES = {
  BUTTON_START: 0, BUTTON_STOP: 1, BUTTON_RESET: 2, BUTTON_ESTOP: 3, BUTTON_CONFIRM: 4,
  S_LIMIT_START: 10, S_LIMIT_END: 11,
  S_MAG_A_EMPTY: 12, S_MAG_B_EMPTY: 13, S_MAG_C_EMPTY: 14,
  S_BIN_HAS_DRUG: 15,
  MSC_A_BACK: 20, MSC_A_FRONT: 21,
  MSC_B_BACK: 22, MSC_B_FRONT: 23,
  MSC_C_BACK: 24, MSC_C_FRONT: 25,
  MSC_TILT_HOLD: 26, MSC_TILT_DUMP: 27,
  MOTOR_FWD: 30, MOTOR_REV: 31,
  CYL_SEND_A: 32, CYL_SEND_B: 33, CYL_SEND_C: 34, CYL_TILT: 35,
  LAMP_GREEN: 36, LAMP_YELLOW: 37, LAMP_RED: 38,
  ENCODER_BIT0: 40, ENCODER_BIT1: 41, ENCODER_BIT2: 42, ENCODER_BIT3: 43,
  ENCODER_BIT4: 44, ENCODER_BIT5: 45, ENCODER_BIT6: 46, ENCODER_BIT7: 47,
};

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

if (require.main === module && process.argv.includes('--check')) {
  let ok = true;
  ok = checkSceneAgainstConstants('coal', COAL_ADDRESSES,
    '../packages/coal-sorting/src/scenes/coal-sorting/constants.ts', 'MODBUS_READ_VARS') && ok;
  ok = checkSceneAgainstConstants('dispensing', DISPENSING_ADDRESSES,
    '../packages/auto-dispensing/src/scenes/auto-dispensing/constants.ts', 'MODBUS_READ_VARS') && ok;
  process.exit(ok ? 0 : 1);
}

module.exports = { COAL_ADDRESSES, DISPENSING_ADDRESSES };