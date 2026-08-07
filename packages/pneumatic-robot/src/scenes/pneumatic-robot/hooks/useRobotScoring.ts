import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { useRobotStore, type ScoringItemStatus } from '../useRobotStore';
import { plcService } from '../../../services/plc-websocket';
import {
  MODBUS_READ_VARS, S7_VARS, MITSUBISHI_READ_VARS,
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
// 评分标准（依据 6 条控制要求，总分 100 = 4 模块 × 25）
//   M1 原点状态   —— 要求①（原点：水平缩回+升降升起+夹爪张开+蓝色原点灯）
//   M2 取料流程   —— 要求②⑤（启动→下降取料→夹紧→升起；运行绿灯/加工黄灯）
//   M3 搬运放料   —— 要求③④（前进→下降放料→张开→升起→缩回回位）
//   M4 停止/急停  —— 要求⑤⑥（停止完成动作后停；急停红灯；复位后再启动）
// 缩回判定兼容单/双电控：retract 线圈 ON（双电控）或 extend 线圈 OFF（单电控）
// ============================================================

export const SCORING_MODULES: ScoringModuleDef[] = [
  {
    id: 'M1',
    name: '原点状态测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M1S1',
        name: '原点状态',
        isPrerequisite: true,
        items: [
          { id: 'm1_fwd_rear',    name: '水平气缸_缩回_磁性开关到位', points: 4, desc: '前后气缸缩回(水平原点ON)' },
          { id: 'm1_lift_rear',   name: '升降气缸_缩回_磁性开关到位', points: 4, desc: '升降气缸升起(升降原点ON)' },
          { id: 'm1_clamp_open',  name: '夹爪_张开_磁性开关到位',     points: 4, desc: '夹爪张开(夹爪松位ON)' },
          { id: 'm1_origin_light',name: '原点指示灯_亮(蓝色)',        points: 4, desc: '原点状态下蓝色原点灯亮' },
          { id: 'm1_no_alarm',    name: '报警指示灯_灭',              points: 3, desc: '非急停状态下报警灯熄灭' },
          { id: 'm1_no_run',      name: '运行指示灯_灭',              points: 3, desc: '待机时绿色运行灯熄灭' },
        ],
      },
      {
        id: 'M1S2',
        name: '待机确认',
        isPrerequisite: false,
        items: [
          { id: 'm1_hold',        name: '原点状态_保持',              points: 3, desc: '原点状态持续保持2秒' },
        ],
      },
    ],
  },
  {
    id: 'M2',
    name: '取料流程测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M2S1',
        name: '启动取料',
        isPrerequisite: true,
        items: [
          { id: 'm2_btn',          name: '启动按钮检测',                points: 2, desc: 'PLC接收启动信号' },
          { id: 'm2_lift_ext_ctrl',name: '升降气缸_伸出_控制信号',      points: 3, desc: '启动后输出下降取料控制' },
          { id: 'm2_lift_front',   name: '升降气缸_伸出_磁性开关到位',  points: 3, desc: '下降到位磁性开关确认' },
          { id: 'm2_clamp_ctrl',   name: '夹爪_夹紧_控制信号',          points: 3, desc: '下降到位后触发夹紧控制' },
          { id: 'm2_clamp_close',  name: '夹爪_夹紧_磁性开关到位',      points: 3, desc: '夹紧磁性开关确认' },
          { id: 'm2_lift_ret_ctrl',name: '升降气缸_缩回_控制信号',      points: 2, desc: '夹紧到位后触发升起控制' },
          { id: 'm2_lift_rear',    name: '升降气缸_缩回_磁性开关到位',  points: 3, desc: '升起到位磁性开关确认' },
        ],
      },
      {
        id: 'M2S2',
        name: '状态灯验证',
        isPrerequisite: false,
        items: [
          { id: 'm2_run_light',    name: '运行指示灯_亮(绿色)',        points: 3, desc: '运行过程中绿色运行灯亮' },
          { id: 'm2_proc_light',   name: '加工指示灯_亮(黄色)',        points: 3, desc: '夹取/搬运时黄色加工灯亮' },
        ],
      },
    ],
  },
  {
    id: 'M3',
    name: '搬运放料流程测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M3S1',
        name: '前进放料',
        isPrerequisite: true,
        items: [
          { id: 'm3_fwd_ext_ctrl',  name: '水平气缸_伸出_控制信号',     points: 3, desc: '取料完成后输出前进控制' },
          { id: 'm3_fwd_front',     name: '水平气缸_伸出_磁性开关到位', points: 4, desc: '前进到位磁性开关确认' },
          { id: 'm3_lift_ext2_ctrl',name: '升降气缸_伸出_控制信号_放料', points: 2, desc: '前进到位后触发放料下降' },
          { id: 'm3_lift_front2',   name: '升降气缸_伸出_磁性开关到位_放料', points: 2, desc: '放料下降到位磁性开关确认' },
          { id: 'm3_clamp_open_ctrl',name: '夹爪_张开_控制信号',       points: 3, desc: '放料到位后触发张开控制' },
          { id: 'm3_clamp_open',    name: '夹爪_张开_磁性开关到位',     points: 3, desc: '张开磁性开关确认' },
          { id: 'm3_lift_ret2_ctrl',name: '升降气缸_缩回_控制信号_放料后', points: 2, desc: '放料后触发升起控制' },
          { id: 'm3_lift_rear2',    name: '升降气缸_缩回_磁性开关到位_放料后', points: 2, desc: '放料后升起到位确认' },
        ],
      },
      {
        id: 'M3S2',
        name: '回位验证',
        isPrerequisite: false,
        items: [
          { id: 'm3_fwd_ret_ctrl',  name: '水平气缸_缩回_控制信号',     points: 2, desc: '放料完成后触发回位控制' },
          { id: 'm3_fwd_rear',      name: '水平气缸_缩回_磁性开关到位', points: 2, desc: '回位磁性开关确认(水平原点ON)' },
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
          { id: 'm4_btn',       name: '停止按钮检测',   points: 2, desc: 'PLC接收停止信号' },
          { id: 'm4_run_off',   name: '运行指示灯_灭', points: 3, desc: '停止后绿色运行灯熄灭' },
          { id: 'm4_proc_off',  name: '加工指示灯_灭', points: 2, desc: '停止后黄色加工灯熄灭' },
        ],
      },
      {
        id: 'M4S2',
        name: '急停测试',
        isPrerequisite: true,
        items: [
          { id: 'm4_estop_btn', name: '急停按钮检测',   points: 3, desc: 'PLC接收急停信号' },
          { id: 'm4_alarm_on',  name: '报警指示灯_亮(红色)', points: 4, desc: '急停时红色报警灯亮' },
          { id: 'm4_run_off2',  name: '运行指示灯_灭', points: 3, desc: '急停后绿色运行灯熄灭' },
        ],
      },
      {
        id: 'M4S3',
        name: '急停复位后重新启动',
        isPrerequisite: false,
        items: [
          { id: 'm4_restart_btn', name: '复位后启动按钮检测', points: 3, desc: '急停复位后再次按下启动' },
          { id: 'm4_alarm_off',   name: '报警指示灯_灭',     points: 3, desc: '重新启动后红色报警灯熄灭' },
          { id: 'm4_run_on',      name: '运行指示灯_亮',     points: 2, desc: '重新启动后绿色运行灯亮' },
        ],
      },
    ],
  },
];

type Step =
  | 'IDLE'
  | 'M1_CHECK_ORIGIN'
  | 'M2_SEND_START'
  | 'M2_WAIT_LOWER'
  | 'M2_WAIT_GRAB'
  | 'M2_WAIT_RAISE'
  | 'M3_WAIT_ADVANCE'
  | 'M3_WAIT_PLACE'
  | 'M3_WAIT_OPEN'
  | 'M3_WAIT_RAISE_BACK'
  | 'M3_WAIT_RETURN'
  | 'M4_SEND_STOP'
  | 'M4_WAIT_STOP'
  | 'M4_SEND_ESTOP'
  | 'M4_WAIT_ESTOP'
  | 'M4_SEND_RESTART'
  | 'M4_WAIT_RESTART'
  | 'FINISHED';

function getReadVars(protocol: ProtocolType) {
  if (protocol === 'modbus') return MODBUS_READ_VARS;
  if (protocol === 's7') return S7_VARS;
  return MITSUBISHI_READ_VARS;
}

export function useRobotScoring() {
  const mode = useAppStore((s) => s.mode);
  const isScoringRunning = useRobotStore((s) => s.isScoringRunning);
  const setScoringRunning = useRobotStore((s) => s.setScoringRunning);
  const setScoringComplete = useRobotStore((s) => s.setScoringComplete);
  const markScoringItem = useRobotStore((s) => s.markScoringItem);
  const markItemsSkipped = useRobotStore((s) => s.markItemsSkipped);
  const resetScore = useRobotStore((s) => s.resetScore);
  const setScoringPrompt = useRobotStore((s) => s.setScoringPrompt);

  const stepRef = useRef<Step>('IDLE');
  const timerRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const processingRef = useRef(false);
  const moduleFailedRef = useRef(-1);

  /** 上一轮 IO 帧（缩回判定/边沿检测用） */
  const prevSignalsRef = useRef<Record<string, boolean> | null>(null);
  /** 电磁阀上一轮状态（双电控上升沿自锁） */
  const prevSolRef = useRef({
    fwdRetract: false, fwdExtend: false,
    liftRetract: false, liftExtend: false,
    clampOpen: false, clampClose: false,
  });

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const mark = useCallback((itemId: string, status: ScoringItemStatus, label: string, points: number) => {
    const current = useRobotStore.getState().scoringStatus[itemId];
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
    return useRobotStore.getState().scoringStatus[itemId] === 'passed';
  }, []);

  const getAllModuleItems = (moduleDef: ScoringModuleDef): ScoringItemDef[] =>
    moduleDef.subModules.flatMap(sm => sm.items);

  const getFollowUpSubModules = (moduleDef: ScoringModuleDef): ScoringSubModuleDef[] =>
    moduleDef.subModules.filter(sm => !sm.isPrerequisite);

  const skipModule = useCallback((moduleIndex: number) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const items = getAllModuleItems(moduleDef)
      .filter(item => {
        const st = useRobotStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (items.length > 0) markItemsSkipped(items);
  }, [markItemsSkipped]);

  const skipFollowUpSubModules = useCallback((moduleIndex: number) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const followUpItems = getFollowUpSubModules(moduleDef)
      .flatMap(sm => sm.items)
      .filter(item => {
        const st = useRobotStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (followUpItems.length > 0) markItemsSkipped(followUpItems);
  }, [markItemsSkipped]);

  const skipSubModule = useCallback((moduleIndex: number, subModuleId: string) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const items = moduleDef.subModules
      .find(sm => sm.id === subModuleId)?.items
      .filter(item => {
        const st = useRobotStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (items && items.length > 0) markItemsSkipped(items);
  }, [markItemsSkipped]);

  const safeTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  /** 单/双电控通用的"缩回命令已发出"判定 */
  const isRetractCommandSatisfied = (sig: Record<string, boolean>, retractKey: string, extendKey: string): boolean => {
    if (sig[retractKey]) return true;                       // 双电控：retract 线圈 ON
    return !sig[extendKey] && !!prevSignalsRef.current?.[extendKey]; // 单电控：extend 线圈由 ON→OFF
  };

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

  const readVarsOnce = async (): Promise<Record<string, boolean> | null> => {
    try {
      const result = await plcService.readVars(Object.keys(getReadVars(plcService.protocol)));
      if (result.success && result.values) return result.values;
    } catch { /* 忽略单次读取失败 */ }
    return null;
  };

  /** IO 双向同步：PLC→模型（电磁阀/指示灯）+ 模型→PLC（磁性开关） */
  const syncIO = async (v: Record<string, boolean>) => {
    const store = useRobotStore.getState();
    const isDouble = true; // 评分按双电控语义驱动模型（与仿真面板默认一致）

    if (isDouble) {
      const p = prevSolRef.current;
      const fwdExtendRising = v['SOLENOID_FORWARD_EXTEND'] && !p.fwdExtend;
      const fwdRetractRising = v['SOLENOID_FORWARD_RETRACT'] && !p.fwdRetract;
      const liftExtendRising = v['SOLENOID_LIFT_EXTEND'] && !p.liftExtend;
      const liftRetractRising = v['SOLENOID_LIFT_RETRACT'] && !p.liftRetract;
      const clampOpenRising = v['SOLENOID_CLAMP_OPEN'] && !p.clampOpen;
      const clampCloseRising = v['SOLENOID_CLAMP_CLOSE'] && !p.clampClose;

      if (fwdExtendRising) store.setCylinder('forward', true);
      else if (fwdRetractRising) store.setCylinder('forward', false);
      if (liftExtendRising) store.setCylinder('lift', true);
      else if (liftRetractRising) store.setCylinder('lift', false);
      if (clampOpenRising) store.setCylinder('clamp', true);
      else if (clampCloseRising) store.setCylinder('clamp', false);

      prevSolRef.current = {
        fwdRetract: !!v['SOLENOID_FORWARD_RETRACT'], fwdExtend: !!v['SOLENOID_FORWARD_EXTEND'],
        liftRetract: !!v['SOLENOID_LIFT_RETRACT'], liftExtend: !!v['SOLENOID_LIFT_EXTEND'],
        clampOpen: !!v['SOLENOID_CLAMP_OPEN'], clampClose: !!v['SOLENOID_CLAMP_CLOSE'],
      };
    }

    store.setIndicator('home', !!v['INDICATOR_ORIGIN']);
    store.setIndicator('running', !!v['INDICATOR_WORKING']);
    store.setIndicator('processing', !!v['INDICATOR_PROCESSING']);
    store.setIndicator('alarm', !!v['INDICATOR_ALARM']);

    const cyls = useRobotStore.getState().cylinders;
    const varNames = [
      'MAG_FORWARD_REAR', 'MAG_FORWARD_FRONT',
      'MAG_LIFT_REAR', 'MAG_LIFT_FRONT',
      'MAG_CLAMP_OPEN', 'MAG_CLAMP_CLOSE',
    ];
    await plcService.writeVars(varNames, [
      cyls.forward.magRear, cyls.forward.magFront,
      cyls.lift.magRear, cyls.lift.magFront,
      cyls.clamp.magFront, cyls.clamp.magRear,
    ]);
  };

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
      prevSignalsRef.current = null;
      clearAllTimeouts();
      setScoringPrompt('');
      return;
    }

    resetScore();
    useRobotStore.getState().resetAll();
    stepRef.current = 'M1_CHECK_ORIGIN';
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

    const scoringInterval = plcService.protocol === 's7' ? 800 : 300;
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
        stepRef.current = 'M2_SEND_START';
        setScoringPrompt('⏳ 模块2/4：取料流程 — 发送启动信号...');
        break;
      case 1:
        stepRef.current = 'M3_WAIT_ADVANCE';
        setScoringPrompt('⏳ 模块3/4：搬运放料 — 检测PLC响应中...');
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
    if (useRobotStore.getState().scoringComplete) return;
    const step = stepRef.current;
    const now = Date.now();

    const signals = await readVarsOnce();
    if (!signals) return;
    if (step !== 'M2_SEND_START' && step !== 'M4_SEND_STOP'
      && step !== 'M4_SEND_ESTOP' && step !== 'M4_SEND_RESTART') {
      await syncIO(signals);
    }
    prevSignalsRef.current = signals;

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

    switch (step) {
      case 'M1_CHECK_ORIGIN': {
        if (sig['MAG_FORWARD_REAR'])
          pass('m1_fwd_rear', '【原点状态】水平气缸缩回磁性开关到位', 4);
        if (sig['MAG_LIFT_REAR'])
          pass('m1_lift_rear', '【原点状态】升降气缸升起磁性开关到位', 4);
        if (sig['MAG_CLAMP_OPEN'])
          pass('m1_clamp_open', '【原点状态】夹爪张开磁性开关到位', 4);
        if (sig['INDICATOR_ORIGIN'])
          pass('m1_origin_light', '【原点状态】蓝色原点指示灯亮', 4);
        if (!sig['INDICATOR_ALARM'])
          pass('m1_no_alarm', '【原点状态】报警指示灯熄灭', 3);
        if (!sig['INDICATOR_WORKING'])
          pass('m1_no_run', '【原点状态】运行指示灯熄灭', 3);

        if (now - timerRef.current > 10000) {
          const st = useRobotStore.getState().scoringStatus;
          const allOriginPassed = [
            'm1_fwd_rear', 'm1_lift_rear', 'm1_clamp_open',
            'm1_origin_light', 'm1_no_alarm', 'm1_no_run',
          ].every(id => st[id] === 'passed');
          if (!allOriginPassed) {
            moduleFailedRef.current = 0;
            skipModule(0);
            advanceToNextModule(0);
          } else {
            pass('m1_hold', '【原点状态】原点状态保持确认', 3);
            stepRef.current = 'M2_SEND_START';
            timerRef.current = now;
            setScoringPrompt('⏳ 模块2/4：取料流程 — 发送启动信号...');
          }
          break;
        }
        if (['m1_fwd_rear', 'm1_lift_rear', 'm1_clamp_open',
             'm1_origin_light', 'm1_no_alarm', 'm1_no_run'].every(hasPassed)
          && now - timerRef.current > 2000) {
          pass('m1_hold', '【原点状态】原点状态保持确认', 3);
          stepRef.current = 'M2_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：取料流程 — 发送启动信号...');
        }
        break;
      }

      case 'M2_SEND_START': {
        const ok = await sendPulse('BUTTON_START');
        if (ok) {
          pass('m2_btn', '【取料流程】启动按钮检测', 2);
        } else {
          fail('m2_btn', '【取料流程】启动信号发送失败(写入超时)', 2);
          moduleFailedRef.current = 1;
          skipModule(1);
          advanceToNextModule(1);
          break;
        }
        setScoringPrompt('⏳ 模块2/4：取料流程 — 检测PLC响应中...');
        stepRef.current = 'M2_WAIT_LOWER';
        timerRef.current = now;
        break;
      }

      case 'M2_WAIT_LOWER': {
        if (sig['SOLENOID_LIFT_EXTEND'])
          pass('m2_lift_ext_ctrl', '【取料流程】升降气缸伸出控制信号(下降取料)', 3);
        if (sig['INDICATOR_WORKING'])
          pass('m2_run_light', '【取料流程】绿色运行指示灯亮', 3);
        if (sig['INDICATOR_PROCESSING'])
          pass('m2_proc_light', '【取料流程】黄色加工指示灯亮', 3);
        if (sig['MAG_LIFT_FRONT']) {
          pass('m2_lift_front', '【取料流程】升降气缸伸出磁性开关到位(下降到位)', 3);
          stepRef.current = 'M2_WAIT_GRAB';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m2_lift_ext_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m2_lift_ext_ctrl', '【取料流程】升降气缸伸出控制信号未触发', 3);
            moduleFailedRef.current = 1;
            skipModule(1);
          } else {
            fail('m2_lift_front', '【取料流程】升降气缸伸出磁性开关未到位', 3);
            skipFollowUpSubModules(1);
          }
          advanceToNextModule(1);
        }
        break;
      }

      case 'M2_WAIT_GRAB': {
        if (sig['SOLENOID_CLAMP_CLOSE'])
          pass('m2_clamp_ctrl', '【取料流程】夹爪夹紧控制信号', 3);
        if (sig['INDICATOR_WORKING'])
          pass('m2_run_light', '【取料流程】绿色运行指示灯亮', 3);
        if (sig['INDICATOR_PROCESSING'])
          pass('m2_proc_light', '【取料流程】黄色加工指示灯亮', 3);
        if (sig['MAG_CLAMP_CLOSE']) {
          pass('m2_clamp_close', '【取料流程】夹爪夹紧磁性开关到位', 3);
          stepRef.current = 'M2_WAIT_RAISE';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m2_clamp_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m2_clamp_ctrl', '【取料流程】夹爪夹紧控制信号未触发', 3);
            moduleFailedRef.current = 1;
            skipModule(1);
          } else {
            fail('m2_clamp_close', '【取料流程】夹爪夹紧磁性开关未到位', 3);
            skipFollowUpSubModules(1);
          }
          advanceToNextModule(1);
        }
        break;
      }

      case 'M2_WAIT_RAISE': {
        if (isRetractCommandSatisfied(sig, 'SOLENOID_LIFT_RETRACT', 'SOLENOID_LIFT_EXTEND'))
          pass('m2_lift_ret_ctrl', '【取料流程】升降气缸缩回控制信号(升起)', 2);
        if (sig['INDICATOR_WORKING'])
          pass('m2_run_light', '【取料流程】绿色运行指示灯亮', 3);
        if (sig['INDICATOR_PROCESSING'])
          pass('m2_proc_light', '【取料流程】黄色加工指示灯亮', 3);
        if (sig['MAG_LIFT_REAR']) {
          pass('m2_lift_rear', '【取料流程】升降气缸缩回磁性开关到位(升起到位)', 3);
          stepRef.current = 'M3_WAIT_ADVANCE';
          timerRef.current = now;
          prevSignalsRef.current = null;
          setScoringPrompt('⏳ 模块3/4：搬运放料 — 检测PLC响应中...');
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m2_lift_ret_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m2_lift_ret_ctrl', '【取料流程】升降气缸缩回控制信号未触发', 2);
            moduleFailedRef.current = 1;
            skipModule(1);
          } else {
            fail('m2_lift_rear', '【取料流程】升降气缸缩回磁性开关未到位', 3);
            skipFollowUpSubModules(1);
          }
          advanceToNextModule(1);
        }
        break;
      }

      case 'M3_WAIT_ADVANCE': {
        if (sig['SOLENOID_FORWARD_EXTEND'])
          pass('m3_fwd_ext_ctrl', '【搬运放料】水平气缸伸出控制信号(前进)', 3);
        if (sig['MAG_FORWARD_FRONT']) {
          pass('m3_fwd_front', '【搬运放料】水平气缸伸出磁性开关到位(前进到位)', 4);
          stepRef.current = 'M3_WAIT_PLACE';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m3_fwd_ext_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m3_fwd_ext_ctrl', '【搬运放料】水平气缸伸出控制信号未触发', 3);
            moduleFailedRef.current = 2;
            skipModule(2);
          } else {
            fail('m3_fwd_front', '【搬运放料】水平气缸伸出磁性开关未到位', 4);
            skipFollowUpSubModules(2);
          }
          advanceToNextModule(2);
        }
        break;
      }

      case 'M3_WAIT_PLACE': {
        if (sig['SOLENOID_LIFT_EXTEND'])
          pass('m3_lift_ext2_ctrl', '【搬运放料】升降气缸伸出控制信号(放料下降)', 2);
        if (sig['MAG_LIFT_FRONT']) {
          pass('m3_lift_front2', '【搬运放料】升降气缸伸出磁性开关到位(放料到位)', 2);
          stepRef.current = 'M3_WAIT_OPEN';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m3_lift_ext2_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m3_lift_ext2_ctrl', '【搬运放料】升降气缸伸出控制信号未触发', 2);
            moduleFailedRef.current = 2;
            skipModule(2);
          } else {
            fail('m3_lift_front2', '【搬运放料】升降气缸伸出磁性开关未到位', 2);
            skipSubModule(2, 'M3S2');
          }
          advanceToNextModule(2);
        }
        break;
      }

      case 'M3_WAIT_OPEN': {
        if (sig['SOLENOID_CLAMP_OPEN'])
          pass('m3_clamp_open_ctrl', '【搬运放料】夹爪张开控制信号', 3);
        if (sig['MAG_CLAMP_OPEN']) {
          pass('m3_clamp_open', '【搬运放料】夹爪张开磁性开关到位', 3);
          stepRef.current = 'M3_WAIT_RAISE_BACK';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m3_clamp_open_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m3_clamp_open_ctrl', '【搬运放料】夹爪张开控制信号未触发', 3);
            moduleFailedRef.current = 2;
            skipModule(2);
          } else {
            fail('m3_clamp_open', '【搬运放料】夹爪张开磁性开关未到位', 3);
            skipSubModule(2, 'M3S2');
          }
          advanceToNextModule(2);
        }
        break;
      }

      case 'M3_WAIT_RAISE_BACK': {
        if (isRetractCommandSatisfied(sig, 'SOLENOID_LIFT_RETRACT', 'SOLENOID_LIFT_EXTEND'))
          pass('m3_lift_ret2_ctrl', '【搬运放料】升降气缸缩回控制信号(放料后升起)', 2);
        if (sig['MAG_LIFT_REAR']) {
          pass('m3_lift_rear2', '【搬运放料】升降气缸缩回磁性开关到位(放料后升起)', 2);
          stepRef.current = 'M3_WAIT_RETURN';
          timerRef.current = now;
          prevSignalsRef.current = null;
        }
        if (now - timerRef.current > 12000) {
          const ctrlPassed = useRobotStore.getState().scoringStatus['m3_lift_ret2_ctrl'] === 'passed';
          if (!ctrlPassed) {
            fail('m3_lift_ret2_ctrl', '【搬运放料】升降气缸缩回控制信号未触发', 2);
            moduleFailedRef.current = 2;
            skipModule(2);
          } else {
            fail('m3_lift_rear2', '【搬运放料】升降气缸缩回磁性开关未到位', 2);
            skipSubModule(2, 'M3S2');
          }
          advanceToNextModule(2);
        }
        break;
      }

      case 'M3_WAIT_RETURN': {
        if (isRetractCommandSatisfied(sig, 'SOLENOID_FORWARD_RETRACT', 'SOLENOID_FORWARD_EXTEND'))
          pass('m3_fwd_ret_ctrl', '【搬运放料】水平气缸缩回控制信号(回位)', 2);
        if (sig['MAG_FORWARD_REAR']) {
          pass('m3_fwd_rear', '【搬运放料】水平气缸缩回磁性开关到位(回位)', 2);
          stepRef.current = 'M4_SEND_STOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送停止信号...');
        }
        if (now - timerRef.current > 12000) {
          fail('m3_fwd_ret_ctrl', '【搬运放料】水平气缸缩回控制信号未触发', 2);
          fail('m3_fwd_rear', '【搬运放料】水平气缸缩回磁性开关未到位', 2);
          stepRef.current = 'M4_SEND_STOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送停止信号...');
        }
        break;
      }

      case 'M4_SEND_STOP': {
        const ok = await sendPulse('BUTTON_STOP');
        if (ok) {
          pass('m4_btn', '【停止/急停】停止按钮检测', 2);
        } else {
          fail('m4_btn', '【停止/急停】停止信号发送失败(写入超时)', 2);
          moduleFailedRef.current = 3;
          skipModule(3);
          advanceToNextModule(3);
          break;
        }
        stepRef.current = 'M4_WAIT_STOP';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测PLC响应中...');
        break;
      }

      case 'M4_WAIT_STOP': {
        if (!sig['INDICATOR_WORKING'])
          pass('m4_run_off', '【停止/急停】停止后运行指示灯熄灭', 3);
        if (!sig['INDICATOR_PROCESSING'])
          pass('m4_proc_off', '【停止/急停】停止后加工指示灯熄灭', 2);
        if (now - timerRef.current > 8000) {
          ['m4_run_off', 'm4_proc_off'].forEach(id => {
            const st = useRobotStore.getState().scoringStatus;
            if (!st[id] || st[id] === 'pending') {
              fail(id, '【停止/急停】超时未完成', SCORING_MODULES[3].subModules.flatMap(sm => sm.items).find(i => i.id === id)?.points ?? 0);
            }
          });
          stepRef.current = 'M4_SEND_ESTOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送急停信号...');
        } else if (hasPassed('m4_run_off') && hasPassed('m4_proc_off')) {
          stepRef.current = 'M4_SEND_ESTOP';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 发送急停信号...');
        }
        break;
      }

      case 'M4_SEND_ESTOP': {
        const ok = await sendPulse('BUTTON_ESTOP');
        if (ok) {
          pass('m4_estop_btn', '【停止/急停】急停按钮检测', 3);
        } else {
          fail('m4_estop_btn', '【停止/急停】急停信号发送失败(写入超时)', 3);
          moduleFailedRef.current = 3;
          skipModule(3);
          advanceToNextModule(3);
          break;
        }
        stepRef.current = 'M4_WAIT_ESTOP';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测PLC响应中...');
        break;
      }

      case 'M4_WAIT_ESTOP': {
        if (sig['INDICATOR_ALARM'])
          pass('m4_alarm_on', '【停止/急停】红色报警指示灯亮', 4);
        if (!sig['INDICATOR_WORKING'])
          pass('m4_run_off2', '【停止/急停】急停后运行指示灯熄灭', 3);
        if (now - timerRef.current > 8000) {
          ['m4_alarm_on', 'm4_run_off2'].forEach(id => {
            const st = useRobotStore.getState().scoringStatus;
            if (!st[id] || st[id] === 'pending') {
              fail(id, '【停止/急停】超时未完成', SCORING_MODULES[3].subModules.flatMap(sm => sm.items).find(i => i.id === id)?.points ?? 0);
            }
          });
          stepRef.current = 'M4_SEND_RESTART';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 复位后重新启动...');
        } else if (hasPassed('m4_alarm_on') && hasPassed('m4_run_off2')) {
          stepRef.current = 'M4_SEND_RESTART';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：停止/急停 — 复位后重新启动...');
        }
        break;
      }

      case 'M4_SEND_RESTART': {
        const ok = await sendPulse('BUTTON_START');
        if (ok) {
          pass('m4_restart_btn', '【停止/急停】复位后启动按钮检测', 3);
        } else {
          fail('m4_restart_btn', '【停止/急停】复位启动信号发送失败(写入超时)', 3);
          moduleFailedRef.current = 3;
          skipModule(3);
          advanceToNextModule(3);
          break;
        }
        stepRef.current = 'M4_WAIT_RESTART';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块4/4：停止/急停 — 检测复位响应...');
        break;
      }

      case 'M4_WAIT_RESTART': {
        if (!sig['INDICATOR_ALARM'])
          pass('m4_alarm_off', '【停止/急停】复位后报警指示灯熄灭', 3);
        if (sig['INDICATOR_WORKING'])
          pass('m4_run_on', '【停止/急停】复位后运行指示灯亮', 2);
        if (now - timerRef.current > 8000) {
          ['m4_alarm_off', 'm4_run_on'].forEach(id => {
            const st = useRobotStore.getState().scoringStatus;
            if (!st[id] || st[id] === 'pending') {
              fail(id, '【停止/急停】超时未完成', SCORING_MODULES[3].subModules.flatMap(sm => sm.items).find(i => i.id === id)?.points ?? 0);
            }
          });
          stepRef.current = 'FINISHED';
          timerRef.current = now;
          setScoringPrompt('🏁 评分结束');
        } else if (hasPassed('m4_alarm_off') && hasPassed('m4_run_on')) {
          stepRef.current = 'FINISHED';
          timerRef.current = now;
          setScoringPrompt('🏁 评分结束');
        }
        break;
      }

      case 'FINISHED': {
        const st = useRobotStore.getState().scoringStatus;
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

export default useRobotScoring;
