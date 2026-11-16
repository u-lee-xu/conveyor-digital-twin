/**
 * 操作站按钮 → PLC 输入点的**唯一写通道**。
 *
 * 面板操作站区块与 3D 开关柜柜面按钮共用这三个入口，保证两处口径完全一致：
 * 按下 / 松开先落 store 姿态真值（柜面与面板同源显示），再按「已连接 PLC」把
 * 7 个输入点整块写成线圈（Modbus）或按名写成布尔（S7 / 三菱）。
 *
 * 红线：
 *  - 观众端 `isViewerRuntime()` 直接短路，零上行；
 *  - 未连接 PLC 时只改本地，不发任何帧（手动 / 演示模式全程不发帧）；
 *  - 整块写 + `lastKey` 去重：手自动档位变化与点动按下都在同一帧内落库，
 *    两档互斥由 operatorBits() 保证，不可能出现「手动自动同时为真」。
 */
import { isViewerRuntime } from '@digital-twin/shared';
import { modbusService } from '@digital-twin/shared/services/modbus-websocket';
import { useLiquidStore } from '../stores/useLiquidStore';
import {
  LIQUID_COILS, LIQUID_OPERATOR_COIL_NAMES, type LiquidOperatorCoilName,
} from '../constants/liquidVariables';
import type { LiquidOperatorKey, LiquidOperatorMode, OperatorState } from '../constants/liquidConstants';

/**
 * 操作站输入点的扁平顺序 = Modbus 线圈连续块顺序
 * = 地址表行顺序 = 柜面按钮排布顺序（启动 → 停止 → 复位 → 急停 → 手动 → 自动 → 放料）。
 */
const OP_ORDER: readonly LiquidOperatorCoilName[] = [
  LIQUID_OPERATOR_COIL_NAMES.start,
  LIQUID_OPERATOR_COIL_NAMES.stop,
  LIQUID_OPERATOR_COIL_NAMES.reset,
  LIQUID_OPERATOR_COIL_NAMES.estop,
  LIQUID_OPERATOR_COIL_NAMES.manual,
  LIQUID_OPERATOR_COIL_NAMES.auto,
  LIQUID_OPERATOR_COIL_NAMES.release,
];
const OP_BASE = LIQUID_COILS[LIQUID_OPERATOR_COIL_NAMES.start];

/** 档位互锁：两位选择开关必有一真一假，绝不允许两档同时为真 */
function operatorBits(o: OperatorState): boolean[] {
  return [
    o.start, o.stop, o.reset, o.estop,
    o.mode === 'manual', o.mode === 'auto',
    o.release,
  ];
}

/** 上一次成功写出的位串；失败或断连时清空，下一轮自动重试 */
let lastKey = '';

/**
 * 把当前操作站姿态写成一帧 PLC 输入。
 * 每次 300ms 轮询都会调用一次，位串没变就整轮跳过，正常跑只多发首帧与每次操作。
 */
export function flushLiquidOperator(force = false): void {
  if (isViewerRuntime()) return;
  const st = useLiquidStore.getState();
  if (!st.connected) { lastKey = ''; return; }
  const bits = operatorBits(st.operator);
  const key = bits.map((b) => (b ? '1' : '0')).join('');
  if (!force && key === lastKey) return;
  // 先占位：一次写慢于轮询间隔时不会重复发帧；失败再回滚以便重试
  lastKey = key;
  const send = modbusService.getProtocol() === 'modbus'
    ? modbusService.writeCoils(OP_BASE, bits)
    : modbusService.writeVars([...OP_ORDER], bits);
  void send
    .then((r) => { if (!r.success) lastKey = ''; })
    .catch(() => { lastKey = ''; });
}

/** 点动按钮按下 / 松开 */
export function pressLiquidOperator(key: LiquidOperatorKey, down: boolean): void {
  useLiquidStore.getState().pressOperator(key, down);
  flushLiquidOperator();
}

/** 手自动两位选择开关拨动 */
export function selectLiquidOperatorMode(mode: LiquidOperatorMode): void {
  useLiquidStore.getState().setOperatorMode(mode);
  flushLiquidOperator();
}

/** 连接建立 / 断开时同步整块输入点（断开只需清去重键，不写帧） */
export function syncLiquidOperatorOnConnect(): void {
  flushLiquidOperator(true);
}
