import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useTrafficStore, type ScoringItemStatus, type LampKey } from '../useTrafficStore';
import { plcService } from '../../../services/plc-websocket';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
  SCORING_POLL_INTERVAL, inDurationWindow, flashPhaseInWindow, cycleDuration, derivedRed,
} from '../constants';
import type { ProtocolType } from '../../../services/plc-websocket';

/** 评分项定义 */
export interface ScoringItemDef {
  id: string;
  name: string;
  points: number;
  desc: string;
}

/** 评分子模块定义 */
export interface ScoringSubModuleDef {
  id: string;
  name: string;
  isPrerequisite: boolean;
  items: ScoringItemDef[];
}

/** 评分模块定义 */
export interface ScoringModuleDef {
  id: string;
  name: string;
  maxPoints: number;
  subModules: ScoringSubModuleDef[];
}

// ============================================================
// 评分标准（总分 100 = 4 模块 × 25，依据 6 条控制要求）
//   M1 初始状态 —— 上电全灭、启动按钮、启动后东西绿/南北红、启动瞬间互锁
//   M2 东西相位 —— 绿稳时长 / 绿闪(1Hz交替≥2) / 闪时长 / 黄切换+时长 / 红切换+时长
//   M3 南北相位+互锁 —— 南北错相相位全流程 + 全程绿绿/绿黄互锁监控
//   M4 停止/急停 —— 停止完成当前循环后全灭；急停立即全灭；复位后再启动复亮
// 时长判定 = 设定值 ±40% 窗口（教师参数自动生效）；绿闪相位 0.2~0.8s
// ============================================================

export const SCORING_MODULES: ScoringModuleDef[] = [
  {
    id: 'M1',
    name: '初始状态测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M1S1',
        name: '上电与启动',
        isPrerequisite: true,
        items: [
          { id: 'm1_all_off',      name: '上电全灭_6灯均灭',       points: 4, desc: '上电后6盏灯全部熄灭' },
          { id: 'm1_no_cycle',     name: '未启动_无灯亮_保持',     points: 3, desc: '未按启动前2秒内无任何灯亮' },
          { id: 'm1_btn',          name: '启动按钮检测',           points: 2, desc: 'PLC接收启动信号' },
          { id: 'm1_ew_green',     name: '启动后_东西绿灯亮',      points: 4, desc: '启动后东西方向绿灯亮' },
          { id: 'm1_ns_red',       name: '启动后_南北红灯亮',      points: 4, desc: '启动后南北方向红灯亮' },
          { id: 'm1_lock_green',   name: '启动瞬间_无绿绿同亮',    points: 4, desc: '启动瞬间不允许东西绿与南北绿同时亮' },
          { id: 'm1_lock_yellow',  name: '启动瞬间_无绿黄混亮',    points: 4, desc: '启动瞬间不允许绿与黄同时亮' },
        ],
      },
    ],
  },
  {
    id: 'M2',
    name: '东西相位测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M2S1',
        name: '东西信号时序',
        isPrerequisite: true,
        items: [
          { id: 'm2_green_dur',  name: '绿稳亮时长正确',        points: 4, desc: '绿灯稳定时长=设定值±40%' },
          { id: 'm2_blink',      name: '绿闪出现_交替≥2次',    points: 5, desc: '1Hz闪烁，相位0.2~0.8s，交替≥2次' },
          { id: 'm2_blink_dur',  name: '绿闪时长正确',          points: 4, desc: '绿闪总时长=设定值±40%' },
          { id: 'm2_yellow_on',  name: '黄灯切换',              points: 3, desc: '绿闪结束后黄灯点亮' },
          { id: 'm2_yellow_dur', name: '黄灯时长正确',          points: 4, desc: '黄灯时长=设定值±40%' },
          { id: 'm2_red_on',     name: '红灯切换',              points: 3, desc: '黄灯结束后红灯点亮' },
          { id: 'm2_red_dur',    name: '红灯时长正确',          points: 2, desc: '红灯时长=设定值±40%' },
        ],
      },
    ],
  },
  {
    id: 'M3',
    name: '南北相位与互锁测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M3S1',
        name: '南北信号时序',
        isPrerequisite: true,
        items: [
          { id: 'm3_ns_green',     name: '南北绿灯亮_东西红期间', points: 4, desc: '东西红灯期间南北绿灯亮' },
          { id: 'm3_ns_green_dur', name: '南北绿稳时长正确',      points: 4, desc: '南北绿稳时长=设定值±40%' },
          { id: 'm3_ns_blink',     name: '南北绿闪_交替≥2次',    points: 4, desc: '1Hz闪烁，相位0.2~0.8s，交替≥2次' },
          { id: 'm3_ns_yellow',    name: '南北黄切换_时长正确',  points: 4, desc: '南北黄灯切换且时长=设定值±40%' },
          { id: 'm3_ns_red',       name: '南北红切换',           points: 3, desc: '南北黄灯结束后红灯点亮' },
        ],
      },
      {
        id: 'M3S2',
        name: '互锁监控',
        isPrerequisite: false,
        items: [
          { id: 'm3_lock_gg', name: '全程_无绿绿同亮', points: 3, desc: '全程不允许东西绿与南北绿同时亮' },
          { id: 'm3_lock_gy', name: '全程_无绿黄混亮', points: 3, desc: '全程不允许绿灯与黄灯同时亮' },
        ],
      },
    ],
  },
  {
    id: 'M4',
    name: '停止/急停测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M4S1',
        name: '停止按钮',
        isPrerequisite: true,
        items: [
          { id: 'm4_stop_btn', name: '停止按钮检测',     points: 2, desc: 'PLC接收停止信号' },
          { id: 'm4_stop_off', name: '停止后_全灭',      points: 8, desc: '完成当前循环后6灯全灭(≤1个循环+4s)' },
          { id: 'm4_restart',  name: '停止后再启动_复亮', points: 4, desc: '再次按下启动后信号灯重新运行' },
        ],
      },
      {
        id: 'M4S2',
        name: '急停测试',
        isPrerequisite: true,
        items: [
          { id: 'm4_estop_btn', name: '急停按钮检测',   points: 2, desc: 'PLC接收急停信号' },
          { id: 'm4_estop_off', name: '急停后_立即全灭', points: 5, desc: '急停按下后≤2s内6灯全灭' },
          { id: 'm4_restart2',  name: '急停复位后再启动_复亮', points: 4, desc: '急停复位后再次启动信号灯复亮' },
        ],
      },
    ],
  },
];

type Step =
  | 'IDLE'
  | 'M1_INIT'
  | 'M1_SEND_START'
  | 'M1_WAIT_START'
  | 'M2_EW_GREEN'
  | 'M2_EW_FLASH'
  | 'M2_EW_YELLOW'
  | 'M2_EW_RED'
  | 'M3_NS_GREEN'
  | 'M3_NS_FLASH'
  | 'M3_NS_YELLOW'
  | 'M3_NS_RED'
  | 'M4_SEND_STOP'
  | 'M4_WAIT_STOP'
  | 'M4_SEND_RESTART'
  | 'M4_WAIT_RESTART'
  | 'M4_SEND_ESTOP'
  | 'M4_WAIT_ESTOP'
  | 'M4_SEND_RESTART2'
  | 'M4_WAIT_RESTART2'
  | 'FINISHED';

function getReadVars(protocol: ProtocolType) {
  if (protocol === 'modbus') return MODBUS_READ_VARS;
  if (protocol === 's7') return S7_VARS;
  return MITSUBISHI_READ_VARS;
}

type Sig = Record<string, boolean>;

const LAMP_SIG: { key: LampKey; name: string }[] = [
  { key: 'ew_green', name: 'LIGHT_EW_GREEN' },
  { key: 'ew_yellow', name: 'LIGHT_EW_YELLOW' },
  { key: 'ew_red', name: 'LIGHT_EW_RED' },
  { key: 'ns_green', name: 'LIGHT_NS_GREEN' },
  { key: 'ns_yellow', name: 'LIGHT_NS_YELLOW' },
  { key: 'ns_red', name: 'LIGHT_NS_RED' },
];

export function useTrafficScoring() {
  const mode = useAppStore((s) => s.mode);
  const isScoringRunning = useTrafficStore((s) => s.isScoringRunning);
  const setScoringRunning = useTrafficStore((s) => s.setScoringRunning);
  const setScoringComplete = useTrafficStore((s) => s.setScoringComplete);
  const markScoringItem = useTrafficStore((s) => s.markScoringItem);
  const markItemsSkipped = useTrafficStore((s) => s.markItemsSkipped);
  const resetScore = useTrafficStore((s) => s.resetScore);
  const setScoringPrompt = useTrafficStore((s) => s.setScoringPrompt);

  const stepRef = useRef<Step>('IDLE');
  const timerRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const processingRef = useRef(false);
  const moduleFailedRef = useRef(-1);

  /** 启动脉冲发出时间（M1 互锁窗口起点） */
  const startPulseAtRef = useRef(0);
  const m1LockWindowEndedRef = useRef(false);

  /** 闪烁检测状态 */
  const flashLastOnRef = useRef(false);
  const flashEdgeTimeRef = useRef(0);
  const flashPhaseGoodRef = useRef(true);
  const flashAlternationsRef = useRef(0);

  /** 互锁监控（全程） */
  const lockGgFailedRef = useRef(false);
  const lockGyFailedRef = useRef(false);
  const ggTicksRef = useRef(0);
  const gyTicksRef = useRef(0);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const mark = useCallback((itemId: string, status: ScoringItemStatus, label: string, points: number) => {
    const current = useTrafficStore.getState().scoringStatus[itemId];
    if (current && current !== 'pending') return false;
    markScoringItem(itemId, status, label, points);
    return true;
  }, [markScoringItem]);

  const pass = useCallback((itemId: string, label: string, points: number) => {
    return mark(itemId, 'passed', label, points);
  }, [mark]);

  const fail = useCallback((itemId: string, label: string, points: number) => {
    return mark(itemId, 'failed', label, points);
  }, [mark]);

  const hasPassed = useCallback((itemId: string) => {
    return useTrafficStore.getState().scoringStatus[itemId] === 'passed';
  }, []);

  const getItemPoints = (moduleId: string, itemId: string): number => {
    const mod = SCORING_MODULES.find(m => m.id === moduleId);
    return mod?.subModules.flatMap(sm => sm.items).find(i => i.id === itemId)?.points ?? 0;
  };

  const getAllModuleItems = (moduleDef: ScoringModuleDef): ScoringItemDef[] =>
    moduleDef.subModules.flatMap(sm => sm.items);

  const skipModule = useCallback((moduleIndex: number) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const items = getAllModuleItems(moduleDef)
      .filter(item => {
        const st = useTrafficStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (items.length > 0) markItemsSkipped(items);
  }, [markItemsSkipped]);

  const safeTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  const writeVarWithRetry = async (name: string, value: boolean, retries = 3): Promise<boolean> => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await plcService.writeVar(name, value);
        if (result.success) return true;
        console.warn(`[评分] 写入变量 ${name} 值 ${value} 失败(${i + 1}/${retries}):`, result.error);
      } catch (e) {
        console.warn(`[评分] 写入变量 ${name} 值 ${value} 异常(${i + 1}/${retries}):`, e);
      }
      if (i < retries - 1) await new Promise<void>(r => { safeTimeout(r, 500); });
    }
    return false;
  };

  /** 自复位按钮脉冲：置位 → 保持 → 复位 */
  const sendPulse = async (name: string, duration = 800): Promise<boolean> => {
    const ok = await writeVarWithRetry(name, true);
    if (!ok) {
      console.error(`[评分] 发送脉冲信号 ${name} 失败: 写入true重试耗尽`);
      return false;
    }
    await new Promise<void>(r => {
      safeTimeout(r, duration);
    });
    await writeVarWithRetry(name, false);
    return true;
  };

  const readVarsOnce = async (): Promise<Sig | null> => {
    try {
      const result = await plcService.readVars(Object.keys(getReadVars(plcService.protocol)));
      if (result.success && result.values) return result.values;
    } catch { /* 忽略单次读取失败 */ }
    return null;
  };

  /** PLC → 模型：灯状态同步（3D 场景实时显示） */
  const syncLamps = (v: Sig) => {
    const lamps: Partial<Record<LampKey, boolean>> = {};
    for (const { key, name } of LAMP_SIG) {
      lamps[key] = !!v[name];
    }
    useTrafficStore.getState().setLamps(lamps);
  };

  /** 互锁监控（全程）：绿绿 / 绿黄 */
  const checkInterlock = (v: Sig) => {
    const ewGreen = !!v['LIGHT_EW_GREEN'];
    const nsGreen = !!v['LIGHT_NS_GREEN'];
    const ewYellow = !!v['LIGHT_EW_YELLOW'];
    const nsYellow = !!v['LIGHT_NS_YELLOW'];

    if (ewGreen && nsGreen) {
      ggTicksRef.current++;
      if (ggTicksRef.current >= 2 && !lockGgFailedRef.current) {
        lockGgFailedRef.current = true;
        fail('m3_lock_gg', '【南北相位】互锁违反：东西绿与南北绿同时亮', getItemPoints('M3', 'm3_lock_gg'));
        // 启动瞬间窗口内违规 → M1 互锁项同样失败
        if (startPulseAtRef.current > 0 && !m1LockWindowEndedRef.current) {
          fail('m1_lock_green', '【初始状态】启动瞬间绿绿同亮', getItemPoints('M1', 'm1_lock_green'));
        }
      }
    } else {
      ggTicksRef.current = 0;
    }

    if ((ewGreen && nsYellow) || (nsGreen && ewYellow)) {
      gyTicksRef.current++;
      if (gyTicksRef.current >= 2 && !lockGyFailedRef.current) {
        lockGyFailedRef.current = true;
        fail('m3_lock_gy', '【南北相位】互锁违反：绿灯与黄灯同时亮', getItemPoints('M3', 'm3_lock_gy'));
        if (startPulseAtRef.current > 0 && !m1LockWindowEndedRef.current) {
          fail('m1_lock_yellow', '【初始状态】启动瞬间绿黄混亮', getItemPoints('M1', 'm1_lock_yellow'));
        }
      }
    } else {
      gyTicksRef.current = 0;
    }
  };

  /** M1 互锁窗口结束（启动后 4s）→ 无违规则通过 */
  const checkM1LockWindowEnd = (now: number) => {
    if (startPulseAtRef.current > 0 && !m1LockWindowEndedRef.current && now - startPulseAtRef.current > 4000) {
      m1LockWindowEndedRef.current = true;
      if (!lockGgFailedRef.current) {
        pass('m1_lock_green', '【初始状态】启动瞬间无绿绿同亮', getItemPoints('M1', 'm1_lock_green'));
      }
      if (!lockGyFailedRef.current) {
        pass('m1_lock_yellow', '【初始状态】启动瞬间无绿黄混亮', getItemPoints('M1', 'm1_lock_yellow'));
      }
    }
  };

  /** 初始化闪烁检测 */
  const initFlash = (greenOn: boolean, now: number) => {
    flashLastOnRef.current = greenOn;
    flashEdgeTimeRef.current = now;
    flashPhaseGoodRef.current = true;
    flashAlternationsRef.current = 0;
  };

  /** 闪烁边沿检测，返回是否出现交替（完整灭→亮周期） */
  const trackFlash = (greenOn: boolean, now: number) => {
    if (greenOn === flashLastOnRef.current) return;
    const phaseDur = now - flashEdgeTimeRef.current;
    if (!flashPhaseInWindow(phaseDur)) {
      flashPhaseGoodRef.current = false;
    }
    if (!flashLastOnRef.current && greenOn) {
      // 灭→亮：完成一个完整的灭相位 → 交替 +1
      flashAlternationsRef.current++;
    }
    flashLastOnRef.current = greenOn;
    flashEdgeTimeRef.current = now;
  };

  const anyLampOn = (v: Sig): boolean => LAMP_SIG.some(({ name }) => !!v[name]);

  useEffect(() => {
    if (mode !== 'scoring') {
      setScoringRunning(false);
      stepRef.current = 'IDLE';
      clearAllTimeouts();
    }
  }, [mode, setScoringRunning, clearAllTimeouts]);

  useEffect(() => {
    if (!isScoringRunning) {
      stepRef.current = 'IDLE';
      processingRef.current = false;
      moduleFailedRef.current = -1;
      startPulseAtRef.current = 0;
      m1LockWindowEndedRef.current = false;
      lockGgFailedRef.current = false;
      lockGyFailedRef.current = false;
      ggTicksRef.current = 0;
      gyTicksRef.current = 0;
      clearAllTimeouts();
      setScoringPrompt('');
      return;
    }

    resetScore();
    useTrafficStore.getState().allLampsOff();
    stepRef.current = 'M1_INIT';
    timerRef.current = Date.now();
    moduleFailedRef.current = -1;
    setScoringPrompt('⏳ 正在验证连接...');

    const tick = async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        await processStep();
      } finally {
        processingRef.current = false;
      }
    };

    const scoringInterval = SCORING_POLL_INTERVAL[plcService.protocol] ?? 300;
    const processInterval = setInterval(tick, scoringInterval);
    return () => { clearInterval(processInterval); clearAllTimeouts(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScoringRunning, resetScore]);

  const getModuleIndex = (step: Step): number => {
    if (step.startsWith('M1')) return 0;
    if (step.startsWith('M2')) return 1;
    if (step.startsWith('M3')) return 2;
    if (step.startsWith('M4')) return 3;
    return -1;
  };

  const advanceToNextModule = (currentIdx: number): void => {
    const now = Date.now();
    switch (currentIdx) {
      case 0:
        stepRef.current = 'M2_EW_GREEN';
        setScoringPrompt('⏳ 模块2/4：东西相位 — 检测绿稳时长...');
        break;
      case 1:
        stepRef.current = 'M3_NS_GREEN';
        setScoringPrompt('⏳ 模块3/4：南北相位 — 检测错相时序...');
        break;
      case 2:
        stepRef.current = 'M4_SEND_STOP';
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送停止信号...');
        break;
      case 3:
        stepRef.current = 'FINISHED';
        setScoringPrompt('🏁 评分结束');
        break;
      default:
        stepRef.current = 'FINISHED';
        setScoringPrompt('🏁 评分结束');
    }
    timerRef.current = now;
  };

  async function processStep() {
    if (useTrafficStore.getState().scoringComplete) return;
    const step = stepRef.current;
    const now = Date.now();

    const signals = await readVarsOnce();
    if (!signals) return;
    if (step !== 'M1_SEND_START' && step !== 'M4_SEND_STOP'
      && step !== 'M4_SEND_RESTART' && step !== 'M4_SEND_ESTOP' && step !== 'M4_SEND_RESTART2') {
      syncLamps(signals);
    }

    if (moduleFailedRef.current >= 0) {
      const failedIdx = moduleFailedRef.current;
      const currentModuleIdx = getModuleIndex(step);
      if (currentModuleIdx > failedIdx) {
        skipModule(currentModuleIdx);
        advanceToNextModule(currentModuleIdx);
        return;
      }
    }

    const sig = signals;
    const ewGreen = !!sig['LIGHT_EW_GREEN'];
    const ewYellow = !!sig['LIGHT_EW_YELLOW'];
    const ewRed = !!sig['LIGHT_EW_RED'];
    const nsGreen = !!sig['LIGHT_NS_GREEN'];
    const nsYellow = !!sig['LIGHT_NS_YELLOW'];
    const nsRed = !!sig['LIGHT_NS_RED'];
    const p = useTrafficStore.getState().timing;
    // 东西/南北独立时序参数（红灯由对方方向派生）
    const ewGsMs = p.ew.greenSteady * 1000;
    const ewGfMs = p.ew.greenFlash * 1000;
    const ewYMs = p.ew.yellow * 1000;
    const nsGsMs = p.ns.greenSteady * 1000;
    const nsGfMs = p.ns.greenFlash * 1000;
    const nsYMs = p.ns.yellow * 1000;
    // 东西红灯 = 南北绿+闪+黄；南北红灯 = 东西绿+闪+黄
    const ewRedMs = derivedRed(p.ns) * 1000;
    const nsRedMs = derivedRed(p.ew) * 1000;

    // 互锁全程监控（启动后）
    if (startPulseAtRef.current > 0) {
      checkInterlock(sig);
      checkM1LockWindowEnd(now);
    }

    switch (step) {
      case 'M1_INIT': {
        const allOff = !anyLampOn(sig);
        if (allOff) {
          pass('m1_all_off', '【初始状态】上电全灭(6灯均灭)', 4);
        } else {
          fail('m1_all_off', '【初始状态】上电存在灯亮', 4);
          fail('m1_no_cycle', '【初始状态】未启动时有灯亮', 3);
        }
        if (now - timerRef.current >= 2000) {
          if (allOff) {
            pass('m1_no_cycle', '【初始状态】未启动保持全灭2秒', 3);
          }
          stepRef.current = 'M1_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块1/4：初始状态 — 发送启动信号...');
        }
        if (now - timerRef.current > 8000) {
          const st = useTrafficStore.getState().scoringStatus;
          if (st['m1_all_off'] !== 'passed') fail('m1_all_off', '【初始状态】上电全灭超时', 4);
          if (st['m1_no_cycle'] !== 'passed') fail('m1_no_cycle', '【初始状态】保持全灭超时', 3);
          moduleFailedRef.current = 0;
          skipModule(0);
          advanceToNextModule(0);
        }
        break;
      }

      case 'M1_SEND_START': {
        const ok = await sendPulse('BUTTON_START');
        if (ok) {
          pass('m1_btn', '【初始状态】启动按钮检测', 2);
          startPulseAtRef.current = now;
        } else {
          fail('m1_btn', '【初始状态】启动信号发送失败(写入超时)', 2);
          moduleFailedRef.current = 0;
          skipModule(0);
        }
        stepRef.current = 'M1_WAIT_START';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块1/4：初始状态 — 检测启动响应...');
        break;
      }

      case 'M1_WAIT_START': {
        if (ewGreen) pass('m1_ew_green', '【初始状态】启动后东西绿灯亮', 4);
        if (nsRed) pass('m1_ns_red', '【初始状态】启动后南北红灯亮', 4);
        if (hasPassed('m1_ew_green') && hasPassed('m1_ns_red')) {
          stepRef.current = 'M2_EW_GREEN';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测绿稳时长...');
        }
        if (now - timerRef.current > 10000) {
          const st = useTrafficStore.getState().scoringStatus;
          if (st['m1_ew_green'] !== 'passed') fail('m1_ew_green', '【初始状态】启动后东西绿灯未亮', 4);
          if (st['m1_ns_red'] !== 'passed') fail('m1_ns_red', '【初始状态】启动后南北红灯未亮', 4);
          if (st['m1_lock_green'] !== 'passed') fail('m1_lock_green', '【初始状态】启动瞬间互锁未判定', 4);
          if (st['m1_lock_yellow'] !== 'passed') fail('m1_lock_yellow', '【初始状态】启动瞬间互锁未判定', 4);
          moduleFailedRef.current = 0;
          skipModule(0);
          advanceToNextModule(0);
        }
        break;
      }

      case 'M2_EW_GREEN': {
        // 等待绿稳结束（绿灭=闪烁开始）
        if (!ewGreen && hasPassed('m1_ew_green')) {
          const greenDur = now - timerRef.current;
          if (inDurationWindow(greenDur, ewGsMs)) {
            pass('m2_green_dur', `【东西相位】绿稳时长正确(${(greenDur / 1000).toFixed(1)}s)`, 4);
          } else {
            fail('m2_green_dur', `【东西相位】绿稳时长错误(${(greenDur / 1000).toFixed(1)}s, 期望${p.ew.greenSteady}s±40%)`, 4);
          }
          initFlash(false, now);
          stepRef.current = 'M2_EW_FLASH';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测绿闪...');
        }
        if (now - timerRef.current > ewGsMs * 1.4 + 4000) {
          if (!hasPassed('m2_green_dur')) {
            fail('m2_green_dur', '【东西相位】绿稳超时未结束', 4);
            moduleFailedRef.current = 1;
            skipModule(1);
          }
          initFlash(false, now);
          stepRef.current = 'M2_EW_FLASH';
          timerRef.current = now;
        }
        break;
      }

      case 'M2_EW_FLASH': {
        trackFlash(ewGreen, now);
        // 绿闪结束：黄灯亮（绿灯灭）
        if (ewYellow && !ewGreen) {
          const flashDur = now - timerRef.current;
          const blinkOk = flashAlternationsRef.current >= 2 && flashPhaseGoodRef.current;
          if (blinkOk) {
            pass('m2_blink', `【东西相位】绿闪正常(${flashAlternationsRef.current}次交替)`, 5);
          } else {
            fail('m2_blink', '【东西相位】绿闪异常(交替<2次或相位超差)', 5);
          }
          if (inDurationWindow(flashDur, ewGfMs)) {
            pass('m2_blink_dur', `【东西相位】绿闪时长正确(${(flashDur / 1000).toFixed(1)}s)`, 4);
          } else {
            fail('m2_blink_dur', `【东西相位】绿闪时长错误(${(flashDur / 1000).toFixed(1)}s, 期望${p.ew.greenFlash}s±40%)`, 4);
          }
          stepRef.current = 'M2_EW_YELLOW';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测黄灯时长...');
        }
        if (now - timerRef.current > ewGfMs * 1.4 + 5000) {
          // 忘闪/黄灯迟迟不来 → 该项fail但继续等黄灯
          if (!hasPassed('m2_blink')) {
            const blinkOk = flashAlternationsRef.current >= 2 && flashPhaseGoodRef.current;
            if (blinkOk) {
              pass('m2_blink', `【东西相位】绿闪正常(${flashAlternationsRef.current}次交替)`, 5);
            } else {
              fail('m2_blink', '【东西相位】绿闪异常(交替<2次或相位超差)', 5);
            }
          }
          fail('m2_blink_dur', '【东西相位】绿闪超时未结束', 4);
          stepRef.current = 'M2_EW_YELLOW';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测黄灯时长...');
        }
        break;
      }

      case 'M2_EW_YELLOW': {
        if (ewYellow && !ewRed) {
          pass('m2_yellow_on', '【东西相位】黄灯切换', 3);
        }
        if (ewRed && !ewYellow) {
          const yellowDur = now - timerRef.current;
          if (inDurationWindow(yellowDur, ewYMs)) {
            pass('m2_yellow_dur', `【东西相位】黄灯时长正确(${(yellowDur / 1000).toFixed(1)}s)`, 4);
          } else {
            fail('m2_yellow_dur', `【东西相位】黄灯时长错误(${(yellowDur / 1000).toFixed(1)}s, 期望${p.ew.yellow}s±40%)`, 4);
          }
          stepRef.current = 'M2_EW_RED';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测红灯时长...');
        }
        if (now - timerRef.current > ewYMs * 1.4 + 4000) {
          if (!hasPassed('m2_yellow_on')) fail('m2_yellow_on', '【东西相位】黄灯未切换', 3);
          if (!hasPassed('m2_yellow_dur')) fail('m2_yellow_dur', '【东西相位】黄灯时长超时', 4);
          stepRef.current = 'M2_EW_RED';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：东西相位 — 检测红灯时长...');
        }
        break;
      }

      case 'M2_EW_RED': {
        if (ewRed && !ewYellow) {
          pass('m2_red_on', '【东西相位】红灯切换', 3);
        }
        if (ewGreen) {
          const redDur = now - timerRef.current;
          if (inDurationWindow(redDur, ewRedMs)) {
            pass('m2_red_dur', `【东西相位】红灯时长正确(${(redDur / 1000).toFixed(1)}s)`, 2);
          } else {
            fail('m2_red_dur', `【东西相位】红灯时长错误(${(redDur / 1000).toFixed(1)}s, 期望${(ewRedMs / 1000).toFixed(1)}s±40%)`, 2);
          }
          stepRef.current = 'M3_NS_GREEN';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北绿灯...');
        }
        if (now - timerRef.current > ewRedMs * 1.4 + 4000) {
          if (!hasPassed('m2_red_on')) fail('m2_red_on', '【东西相位】红灯未切换', 3);
          if (!hasPassed('m2_red_dur')) fail('m2_red_dur', '【东西相位】红灯时长超时', 2);
          moduleFailedRef.current = 1;
          skipModule(1);
          stepRef.current = 'M3_NS_GREEN';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北绿灯...');
        }
        break;
      }

      case 'M3_NS_GREEN': {
        if (nsGreen) {
          pass('m3_ns_green', '【南北相位】南北绿灯亮(东西红期间)', 4);
        }
        if (nsGreen && !ewGreen) {
          // 东西红灯期间南北绿灯亮（错相确认）
        }
        if (hasPassed('m3_ns_green') && !nsGreen) {
          const nsGreenDur = now - timerRef.current;
          if (inDurationWindow(nsGreenDur, nsGsMs)) {
            pass('m3_ns_green_dur', `【南北相位】南北绿稳时长正确(${(nsGreenDur / 1000).toFixed(1)}s)`, 4);
          } else {
            fail('m3_ns_green_dur', `【南北相位】南北绿稳时长错误(${(nsGreenDur / 1000).toFixed(1)}s, 期望${p.ns.greenSteady}s±40%)`, 4);
          }
          initFlash(false, now);
          stepRef.current = 'M3_NS_FLASH';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北绿闪...');
        }
        if (now - timerRef.current > nsRedMs + nsGsMs * 1.4 + 5000) {
          if (!hasPassed('m3_ns_green')) {
            fail('m3_ns_green', '【南北相位】南北绿灯未亮', 4);
            moduleFailedRef.current = 2;
            skipModule(2);
          }
          if (!hasPassed('m3_ns_green_dur')) fail('m3_ns_green_dur', '【南北相位】南北绿稳超时', 4);
          initFlash(false, now);
          stepRef.current = 'M3_NS_FLASH';
          timerRef.current = now;
        }
        break;
      }

      case 'M3_NS_FLASH': {
        trackFlash(nsGreen, now);
        if (nsYellow && !nsGreen) {
          const blinkOk = flashAlternationsRef.current >= 2 && flashPhaseGoodRef.current;
          if (blinkOk) {
            pass('m3_ns_blink', `【南北相位】南北绿闪正常(${flashAlternationsRef.current}次交替)`, 4);
          } else {
            fail('m3_ns_blink', '【南北相位】南北绿闪异常(交替<2次或相位超差)', 4);
          }
          stepRef.current = 'M3_NS_YELLOW';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北黄灯...');
        }
        if (now - timerRef.current > nsGfMs * 1.4 + 5000) {
          if (!hasPassed('m3_ns_blink')) {
            const blinkOk = flashAlternationsRef.current >= 2 && flashPhaseGoodRef.current;
            if (blinkOk) {
              pass('m3_ns_blink', `【南北相位】南北绿闪正常(${flashAlternationsRef.current}次交替)`, 4);
            } else {
              fail('m3_ns_blink', '【南北相位】南北绿闪异常(交替<2次或相位超差)', 4);
            }
          }
          stepRef.current = 'M3_NS_YELLOW';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北黄灯...');
        }
        break;
      }

      case 'M3_NS_YELLOW': {
        if (nsYellow && !nsGreen && !hasPassed('m3_ns_yellow')) {
          // 黄灯已切换，记录起点
        }
        if (nsRed && !nsYellow) {
          const yellowDur = now - timerRef.current;
          const yellowOk = inDurationWindow(yellowDur, nsYMs);
          if (yellowOk) {
            pass('m3_ns_yellow', `【南北相位】南北黄切换及时长正确(${(yellowDur / 1000).toFixed(1)}s)`, 4);
          } else {
            fail('m3_ns_yellow', `【南北相位】南北黄时长错误(${(yellowDur / 1000).toFixed(1)}s, 期望${p.ns.yellow}s±40%)`, 4);
          }
          stepRef.current = 'M3_NS_RED';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北红灯...');
        }
        if (now - timerRef.current > nsYMs * 1.4 + 4000) {
          if (!hasPassed('m3_ns_yellow')) fail('m3_ns_yellow', '【南北相位】南北黄灯未切换或超时', 4);
          stepRef.current = 'M3_NS_RED';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：南北相位 — 检测南北红灯...');
        }
        break;
      }

      case 'M3_NS_RED': {
        if (nsRed && !nsYellow) {
          pass('m3_ns_red', '【南北相位】南北红灯切换', 3);
          stepRef.current = 'M4_SEND_STOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送停止信号...');
        }
        if (now - timerRef.current > nsRedMs * 1.4 + 4000) {
          if (!hasPassed('m3_ns_red')) {
            fail('m3_ns_red', '【南北相位】南北红灯未切换', 3);
            moduleFailedRef.current = 2;
            skipModule(2);
          }
          stepRef.current = 'M4_SEND_STOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送停止信号...');
        }
        break;
      }

      case 'M4_SEND_STOP': {
        const ok = await sendPulse('BUTTON_STOP');
        if (ok) {
          pass('m4_stop_btn', '【停止/急停】停止按钮检测', 2);
        } else {
          fail('m4_stop_btn', '【停止/急停】停止信号发送失败(写入超时)', 2);
          moduleFailedRef.current = 3;
          skipModule(3);
          advanceToNextModule(3);
          break;
        }
        stepRef.current = 'M4_WAIT_STOP';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 等待完成循环后全灭...');
        break;
      }

      case 'M4_WAIT_STOP': {
        if (!anyLampOn(sig)) {
          pass('m4_stop_off', '【停止/急停】停止后全灭', 8);
          stepRef.current = 'M4_SEND_RESTART';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 重新启动...');
        }
        const stopWindowMs = cycleDuration(p) * 1000 + 4000;
        if (now - timerRef.current > stopWindowMs) {
          if (!hasPassed('m4_stop_off')) fail('m4_stop_off', '【停止/急停】停止后未全灭(超时)', 8);
          stepRef.current = 'M4_SEND_RESTART';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 重新启动...');
        }
        break;
      }

      case 'M4_SEND_RESTART': {
        const ok = await sendPulse('BUTTON_START');
        if (!ok) {
          fail('m4_restart', '【停止/急停】停止后重启信号发送失败', 4);
        }
        stepRef.current = 'M4_WAIT_RESTART';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测复亮...');
        break;
      }

      case 'M4_WAIT_RESTART': {
        if (ewGreen && nsRed) {
          pass('m4_restart', '【停止/急停】停止后再启动灯复亮', 4);
          stepRef.current = 'M4_SEND_ESTOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送急停信号...');
        }
        if (now - timerRef.current > 8000) {
          if (!hasPassed('m4_restart')) fail('m4_restart', '【停止/急停】停止后重启未复亮', 4);
          stepRef.current = 'M4_SEND_ESTOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送急停信号...');
        }
        break;
      }

      case 'M4_SEND_ESTOP': {
        const ok = await sendPulse('BUTTON_ESTOP');
        if (ok) {
          pass('m4_estop_btn', '【停止/急停】急停按钮检测', 2);
        } else {
          fail('m4_estop_btn', '【停止/急停】急停信号发送失败(写入超时)', 2);
        }
        stepRef.current = 'M4_WAIT_ESTOP';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测急停全灭...');
        break;
      }

      case 'M4_WAIT_ESTOP': {
        if (!anyLampOn(sig)) {
          pass('m4_estop_off', '【停止/急停】急停后立即全灭(≤2s)', 5);
          stepRef.current = 'M4_SEND_RESTART2';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 急停复位后重启...');
        }
        if (now - timerRef.current > 2600) {
          if (!hasPassed('m4_estop_off')) fail('m4_estop_off', '【停止/急停】急停后未立即全灭(>2s)', 5);
          stepRef.current = 'M4_SEND_RESTART2';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 急停复位后重启...');
        }
        break;
      }

      case 'M4_SEND_RESTART2': {
        const ok = await sendPulse('BUTTON_START');
        if (!ok) {
          fail('m4_restart2', '【停止/急停】急停复位后重启信号发送失败', 4);
        }
        stepRef.current = 'M4_WAIT_RESTART2';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测复亮...');
        break;
      }

      case 'M4_WAIT_RESTART2': {
        if (ewGreen && nsRed) {
          pass('m4_restart2', '【停止/急停】急停复位后再启动灯复亮', 4);
          stepRef.current = 'FINISHED';
          timerRef.current = now;
          setScoringPrompt('🏁 评分结束');
        }
        if (now - timerRef.current > 8000) {
          if (!hasPassed('m4_restart2')) fail('m4_restart2', '【停止/急停】急停复位后重启未复亮', 4);
          stepRef.current = 'FINISHED';
          timerRef.current = now;
          setScoringPrompt('🏁 评分结束');
        }
        break;
      }

      case 'FINISHED': {
        const st = useTrafficStore.getState().scoringStatus;
        // 互锁全程通过判定
        if (st['m3_lock_gg'] !== 'failed' && st['m3_lock_gg'] !== 'passed') {
          if (lockGgFailedRef.current) {
            fail('m3_lock_gg', '【南北相位】互锁违反：绿绿同亮', getItemPoints('M3', 'm3_lock_gg'));
          } else {
            pass('m3_lock_gg', '【南北相位】全程无绿绿同亮', getItemPoints('M3', 'm3_lock_gg'));
          }
        }
        if (st['m3_lock_gy'] !== 'failed' && st['m3_lock_gy'] !== 'passed') {
          if (lockGyFailedRef.current) {
            fail('m3_lock_gy', '【南北相位】互锁违反：绿黄混亮', getItemPoints('M3', 'm3_lock_gy'));
          } else {
            pass('m3_lock_gy', '【南北相位】全程无绿黄混亮', getItemPoints('M3', 'm3_lock_gy'));
          }
        }
        const allItems = SCORING_MODULES.flatMap(m => m.subModules.flatMap(sm => sm.items));
        const pendingItems = allItems.filter(i => !st[i.id] || st[i.id] === 'pending');
        if (pendingItems.length > 0) {
          markItemsSkipped(pendingItems.map(i => ({ itemId: i.id, label: i.name, points: i.points })));
        }
        setScoringComplete(true);
        setScoringPrompt('🏁 评分结束');
        break;
      }

      case 'IDLE':
      default:
        break;
    }
  }

  return null;
}

export default useTrafficScoring;
