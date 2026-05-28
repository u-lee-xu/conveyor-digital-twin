import { useEffect, useRef, useCallback } from 'react';
import { useDeviceStore } from '../stores';
import type { ScoringItemStatus } from '../stores/useDeviceStore';
import { MODBUS_ADDRESSES } from '../services/modbus';
import { modbusService as globalModbus } from '../services/modbus-websocket';
import { CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT, CYLINDER_RETRACT_POS, CYLINDER_LIMIT_ZONE } from '../components/scene/shared';

const A = {
  START:           0,
  RESET:           1,
  FEED_IN:         2,
  FEED_OUT:        3,
  SORT1_IN:        4,
  SORT1_OUT:       5,
  SORT2_IN:        6,
  SORT2_OUT:       7,
  FEED_SENSOR:     8,
  COLOR_SENSOR:    9,
  MATERIAL_SENSOR: 10,
  FEED_CTRL:       MODBUS_ADDRESSES.FEED_CYLINDER_VALVE,
  SORT1_CTRL:      MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE,
  SORT2_CTRL:      MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE,
  CONVEYOR:        MODBUS_ADDRESSES.CONVEYOR,
};

export interface ScoringItemDef {
  id: string;
  name: string;
  points: number;
  desc: string;
}

export interface ScoringSubModuleDef {
  id: string;
  name: string;
  isPrerequisite: boolean;
  items: ScoringItemDef[];
}

export interface ScoringModuleDef {
  id: string;
  name: string;
  maxPoints: number;
  subModules: ScoringSubModuleDef[];
}

export const SCORING_MODULES: ScoringModuleDef[] = [
  {
    id: 'M1',
    name: '复位测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M1S1',
        name: '复位触发',
        isPrerequisite: true,
        items: [
          { id: 'm1_btn',       name: '复位按钮检测',                  points: 2, desc: 'PLC接收复位信号(M1)' },
          { id: 'm1_feed_ctrl', name: '上料气缸_缩回_单电控失电',      points: 4, desc: '复位后M100置OFF(单电控弹簧复位)' },
          { id: 'm1_feed_in',   name: '上料气缸_缩回_磁性开关到位',    points: 3, desc: '缩回磁性开关确认(M2)' },
        ],
      },
      {
        id: 'M1S2',
        name: '设备归位+清料',
        isPrerequisite: false,
        items: [
          { id: 'm1_s1_ctrl',     name: '分拣1气缸_缩回_单电控失电',     points: 2, desc: '复位后M101置OFF(单电控弹簧复位)' },
          { id: 'm1_s1_in',       name: '分拣1气缸_缩回_磁性开关到位', points: 1, desc: '缩回磁性开关确认(M4)' },
          { id: 'm1_s2_ctrl',     name: '分拣2气缸_缩回_单电控失电',     points: 2, desc: '复位后M102置OFF(单电控弹簧复位)' },
          { id: 'm1_s2_in',       name: '分拣2气缸_缩回_磁性开关到位', points: 1, desc: '缩回磁性开关确认(M6)' },
          { id: 'm1_conv_start',  name: '传送带_清料_运行_状态变化',   points: 3, desc: '复位同时传送带启动(M103)' },
          { id: 'm1_conv_run',    name: '传送带_清料_运行_状态保持',   points: 2, desc: '清料期间传送带持续运行' },
          { id: 'm1_timer_stop',  name: '传送带_定时停止_状态变化',    points: 3, desc: '5秒定时器到时自动停止' },
          { id: 'm1_timer_hold',  name: '传送带_定时停止_状态保持',    points: 2, desc: '确认停止且不再重启' },
        ],
      },
    ],
  },
  {
    id: 'M2',
    name: '上料流程测试',
    maxPoints: 25,
    subModules: [
      {
        id: 'M2S1',
        name: '上料触发',
        isPrerequisite: true,
        items: [
          { id: 'm2_btn',          name: '启动按钮检测',                points: 2, desc: 'PLC接收启动信号(M0)' },
          { id: 'm2_feed_ctrl',    name: '上料气缸_伸出_控制信号',      points: 3, desc: '启动后输出伸出控制(M100)' },
          { id: 'm2_feed_out',     name: '上料气缸_伸出_磁性开关到位',  points: 3, desc: '伸出磁性开关确认(M3)' },
          { id: 'm2_feed_ret_ctrl',name: '上料气缸_缩回_控制信号',      points: 4, desc: '伸出到位后触发缩回控制(M100)' },
          { id: 'm2_feed_in',      name: '上料气缸_缩回_磁性开关到位',  points: 4, desc: '缩回磁性开关确认(M2)' },
        ],
      },
      {
        id: 'M2S2',
        name: '传送带联动',
        isPrerequisite: false,
        items: [
          { id: 'm2_sensor',     name: '上料传感器_检测_触发',    points: 4, desc: '上料传感器检测到物料(M8)' },
          { id: 'm2_conv_start', name: '传送带_运行_状态变化',    points: 3, desc: '传感器触发后传送带启动(M103)' },
          { id: 'm2_conv_run',   name: '传送带_运行_状态保持',    points: 2, desc: '传送带持续运行至分拣传感器触发' },
        ],
      },
    ],
  },
  {
    id: 'M3',
    name: '黑色物料分拣',
    maxPoints: 25,
    subModules: [
      {
        id: 'M3S1',
        name: '色标检测',
        isPrerequisite: true,
        items: [
          { id: 'm3_color',     name: '色标传感器_触发_检测',    points: 4, desc: '色标传感器识别黑色物料(M9)' },
          { id: 'm3_conv_stop', name: '传送带_停止_状态变化',    points: 4, desc: '色标触发后传送带停止(M103)' },
          { id: 'm3_conv_hold', name: '传送带_停止_状态保持',    points: 3, desc: '传送带停止且不再重启' },
        ],
      },
      {
        id: 'M3S2',
        name: '分拣1号位动作',
        isPrerequisite: false,
        items: [
          { id: 'm3_s1_ctrl',     name: '分拣1气缸_伸出_控制信号',     points: 4, desc: '输出分拣1伸出控制(M101)' },
          { id: 'm3_s1_out',      name: '分拣1气缸_伸出_磁性开关到位', points: 4, desc: '伸出磁性开关确认(M5)' },
          { id: 'm3_s1_ret_ctrl', name: '分拣1气缸_缩回_控制信号',     points: 3, desc: '伸出到位后触发缩回控制(M101)' },
          { id: 'm3_s1_in',       name: '分拣1气缸_缩回_磁性开关到位', points: 3, desc: '缩回磁性开关确认(M4)' },
        ],
      },
    ],
  },
  {
    id: 'M4',
    name: '蓝色物料分拣',
    maxPoints: 25,
    subModules: [
      {
        id: 'M4S1',
        name: '第二轮上料+蓝色运输',
        isPrerequisite: true,
        items: [
          { id: 'm4_btn',       name: '启动按钮检测',              points: 1, desc: '重复步骤(M0)' },
          { id: 'm4_feed_ctrl', name: '上料气缸_伸出_控制信号',    points: 1, desc: '重复步骤(M100)' },
          { id: 'm4_feed_ret',  name: '上料气缸_缩回_控制信号',    points: 1, desc: '重复步骤(M100)' },
          { id: 'm4_sensor',    name: '上料传感器_检测_触发',      points: 1, desc: '重复步骤(M8)' },
          { id: 'm4_conv',      name: '传送带_运行_状态变化',      points: 1, desc: '重复步骤(M103)' },
          { id: 'm4_no_color',  name: '色标传感器_未触发_验证',    points: 2, desc: '蓝色物料经1号位色标不响应(M9)' },
          { id: 'm4_mat_sensor',name: '物料传感器_触发_检测',      points: 3, desc: '物料传感器检测蓝色物料(M10)' },
          { id: 'm4_conv_stop', name: '传送带_停止_状态变化',      points: 3, desc: '物料传感器触发后传送带停止(M103)' },
          { id: 'm4_conv_hold', name: '传送带_停止_状态保持',      points: 2, desc: '传送带停止且不再重启' },
        ],
      },
      {
        id: 'M4S2',
        name: '分拣2号位动作',
        isPrerequisite: false,
        items: [
          { id: 'm4_no_s1',      name: '分拣1气缸_未动作_验证',       points: 1, desc: '确认M5无动作，互锁正确' },
          { id: 'm4_s2_ctrl',    name: '分拣2气缸_伸出_控制信号',     points: 4, desc: '输出分拣2伸出控制(M102)' },
          { id: 'm4_s2_out',     name: '分拣2气缸_伸出_磁性开关到位', points: 3, desc: '伸出磁性开关确认(M7)' },
          { id: 'm4_s2_ret_ctrl',name: '分拣2气缸_缩回_控制信号',     points: 2, desc: '伸出到位后触发缩回控制(M102)' },
        ],
      },
    ],
  },
];

export function isSingleCoilRetractCommandSatisfied(
  cur: boolean[],
  _prev: boolean[],
  controlAddr: number,
): boolean {
  return !cur[controlAddr];
}

function getAllModuleItems(moduleDef: ScoringModuleDef): ScoringItemDef[] {
  return moduleDef.subModules.flatMap(sm => sm.items);
}

function getSubModuleItems(moduleDef: ScoringModuleDef, subModuleId: string): ScoringItemDef[] {
  const sm = moduleDef.subModules.find(s => s.id === subModuleId);
  return sm ? sm.items : [];
}

function getFollowUpSubModules(moduleDef: ScoringModuleDef): ScoringSubModuleDef[] {
  return moduleDef.subModules.filter(sm => !sm.isPrerequisite);
}

type Step =
  | 'IDLE'
  | 'M1_CHECK_CONNECTION'
  | 'M1_INITIALIZE'
  | 'M1_SEND_RESET'
  | 'M1_WAIT_CYLINDERS'
  | 'M1_WAIT_CONVEYOR_STOP'
  | 'M2_SEND_START'
  | 'M2_WAIT_FEED_EXTEND'
  | 'M2_WAIT_FEED_RETRACT'
  | 'M2_WAIT_CONVEYOR'
  | 'M3_INJECT_BLACK'
  | 'M3_WAIT_COLOR_SENSOR'
  | 'M3_WAIT_SORT1_EXTEND'
  | 'M3_WAIT_SORT1_RETRACT'
  | 'M4_SEND_START'
  | 'M4_WAIT_LOAD'
  | 'M4_INJECT_BLUE'
  | 'M4_WAIT_COLOR_PASS'
  | 'M4_WAIT_SORT2_EXTEND'
  | 'M4_WAIT_SORT2_RETRACT'
  | 'FINISHED';

export function useConveyorScoring() {
  const mode             = useDeviceStore(s => s.mode);
  const isScoringRunning = useDeviceStore(s => s.isScoringRunning);
  const setScoringRunning= useDeviceStore(s => s.setScoringRunning);
  const setScoringComplete= useDeviceStore(s => s.setScoringComplete);
  const markScoringItem  = useDeviceStore(s => s.markScoringItem);
  const markItemsSkipped = useDeviceStore(s => s.markItemsSkipped);
  const resetScore       = useDeviceStore(s => s.resetScore);
  const clearTrace       = useDeviceStore(s => s.clearTrace);
  const setScoringPrompt = useDeviceStore(s => s.setScoringPrompt);
  const stepRef       = useRef<Step>('IDLE');
  const timerRef      = useRef<number>(0);
  const timeoutsRef   = useRef<number[]>([]);
  const processingRef = useRef(false);
  const moduleFailedRef = useRef<number>(-1);

  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const mark = useCallback((itemId: string, status: ScoringItemStatus, label: string, points: number) => {
    const current = useDeviceStore.getState().scoringStatus[itemId];
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
    return useDeviceStore.getState().scoringStatus[itemId] === 'passed';
  }, []);

  const skipModule = useCallback((moduleIndex: number) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const items = getAllModuleItems(moduleDef)
      .filter(item => {
        const st = useDeviceStore.getState().scoringStatus[item.id];
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
        const st = useDeviceStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (followUpItems.length > 0) markItemsSkipped(followUpItems);
  }, [markItemsSkipped]);

  const skipSubModule = useCallback((moduleIndex: number, subModuleId: string) => {
    const moduleDef = SCORING_MODULES[moduleIndex];
    if (!moduleDef) return;
    const items = getSubModuleItems(moduleDef, subModuleId)
      .filter(item => {
        const st = useDeviceStore.getState().scoringStatus[item.id];
        return !st || st === 'pending';
      })
      .map(item => ({ itemId: item.id, label: `【${moduleDef.name}】${item.name}`, points: item.points }));
    if (items.length > 0) markItemsSkipped(items);
  }, [markItemsSkipped]);

  const coilsRef = useRef<{ cur: boolean[] | null, prev: boolean[] | null }>({ cur: null, prev: null });
  const stepEntryCoilsRef = useRef<boolean[] | null>(null);

  const captureStepEntry = () => {
    if (coilsRef.current.cur) {
      stepEntryCoilsRef.current = [...coilsRef.current.cur];
    }
  };

  const readCoilsOnce = async (): Promise<boolean[] | null> => {
    try {
      const result = await globalModbus.readCoils(0, 107);
      if (result.success && result.values) return result.values;
    } catch {}
    return null;
  };

  const updateCoils = async () => {
    const v = await readCoilsOnce();
    if (!v) return;
    coilsRef.current.prev = coilsRef.current.cur;
    coilsRef.current.cur = v;
    const { addTraceEntry } = useDeviceStore.getState();
    addTraceEntry(v);

    const feedValve   = v[A.FEED_CTRL]  ?? false;
    const s1Valve     = v[A.SORT1_CTRL] ?? false;
    const s2Valve     = v[A.SORT2_CTRL] ?? false;
    const conveyorVal = v[A.CONVEYOR]   ?? false;

    const { conveyorRunning, startConveyor, stopConveyor, extendCylinder, retractCylinder, cylinders: curCylinders } = useDeviceStore.getState();
    if (conveyorVal) { if (!conveyorRunning) startConveyor(); }
    else             { if (conveyorRunning)  stopConveyor();  }
    if (feedValve !== curCylinders.feed.extended) {
      if (feedValve) extendCylinder('feed'); else retractCylinder('feed');
    }
    if (s1Valve !== curCylinders.sorting1.extended) {
      if (s1Valve) extendCylinder('sorting1'); else retractCylinder('sorting1');
    }
    if (s2Valve !== curCylinders.sorting2.extended) {
      if (s2Valve) extendCylinder('sorting2'); else retractCylinder('sorting2');
    }
  };

  const publishFeedback = useCallback(async () => {
    const { sensors, cylinders } = useDeviceStore.getState();

    const feedExt = cylinders.feed.currentExtension;
    const s1Ext = cylinders.sorting1.currentExtension;
    const s2Ext = cylinders.sorting2.currentExtension;

    const feedAtExtend = feedExt >= CYLINDER_EXTEND_POS_FEED - CYLINDER_LIMIT_ZONE;
    const feedAtRetract = feedExt <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
    const s1AtExtend = s1Ext >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
    const s1AtRetract = s1Ext <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;
    const s2AtExtend = s2Ext >= CYLINDER_EXTEND_POS_SORT - CYLINDER_LIMIT_ZONE;
    const s2AtRetract = s2Ext <= CYLINDER_RETRACT_POS + CYLINDER_LIMIT_ZONE;

    try {
      await globalModbus.writeFeedbackBatch({
        magneticExtend: { feed: feedAtExtend, sort1: s1AtExtend, sort2: s2AtExtend },
        magneticRetract: { feed: feedAtRetract, sort1: s1AtRetract, sort2: s2AtRetract },
        sensors: {
          feed: sensors.feed,
          color: sensors.color,
          material: sensors.material,
        },
      });
    } catch {}
  }, []);

  const getFrames = () => {
    const { cur, prev } = coilsRef.current;
    if (!cur || !prev) return null;
    return { cur, prev };
  };

  const active  = (cur: boolean[], addr: number) => !!cur[addr];

  const becameInactive = (cur: boolean[], addr: number): boolean => {
    const entry = stepEntryCoilsRef.current;
    if (!entry) return !active(cur, addr);
    return entry[addr] && !cur[addr];
  };

  const writeCoilWithRetry = async (addr: number, value: boolean, retries = 3): Promise<boolean> => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await globalModbus.writeCoil(addr, value);
        if (result.success) return true;
        console.warn(`[评分] 写入线圈 地址${addr} 值${value} 失败(${i + 1}/${retries}):`, result.error);
      } catch (e) {
        console.warn(`[评分] 写入线圈 地址${addr} 值${value} 异常(${i + 1}/${retries}):`, e);
      }
      if (i < retries - 1) await new Promise(r => setTimeout(r, 500));
    }
    return false;
  };

  const sendPulse = async (addr: number, duration = 800): Promise<boolean> => {
    const ok = await writeCoilWithRetry(addr, true);
    if (!ok) {
      console.error(`[评分] 发送脉冲信号 地址${addr}失败: 写入true重试耗尽`);
      return false;
    }
    await new Promise(r => setTimeout(r, duration));
    await writeCoilWithRetry(addr, false);
    return true;
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
      coilsRef.current = { cur: null, prev: null };
      clearAllTimeouts();
      setScoringPrompt('');
      return;
    }

    resetScore();
    clearTrace();
    stepRef.current = 'M1_CHECK_CONNECTION';
    moduleFailedRef.current = -1;
    setScoringPrompt('⏳ 正在验证Modbus连接...');

    const tick = async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      try {
        await processStep();
      } finally {
        processingRef.current = false;
      }
    };

    const publishInterval = setInterval(publishFeedback, 200);
    const processInterval = setInterval(tick, 200);
    return () => { clearInterval(publishInterval); clearInterval(processInterval); clearAllTimeouts(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScoringRunning, publishFeedback]);

  const isSendStep = (s: Step): boolean =>
    s === 'M1_CHECK_CONNECTION' || s === 'M1_INITIALIZE' || s === 'M1_SEND_RESET' ||
    s === 'M2_SEND_START' || s === 'M4_SEND_START' || s === 'M3_INJECT_BLACK' ||
    s === 'M4_INJECT_BLUE' || s === 'FINISHED' || s === 'IDLE';

  async function processStep() {
    if (useDeviceStore.getState().scoringComplete) return;
    const step = stepRef.current;
    const now = Date.now();

    if (!isSendStep(step)) {
      await updateCoils();
    }

    const f = getFrames();

    if (moduleFailedRef.current >= 0) {
      const failedIdx = moduleFailedRef.current;
      const currentModuleIdx = getModuleIndex(step);
      if (currentModuleIdx > failedIdx) {
        skipModule(currentModuleIdx);
        advanceToNextModule(currentModuleIdx);
        return;
      }
    }

    switch (step) {

      case 'M1_CHECK_CONNECTION': {
        try {
          const result = await globalModbus.readCoils(0, 1);
          if (result.success) {
            console.log('[评分] Modbus连接验证成功');
            stepRef.current = 'M1_INITIALIZE';
            setScoringPrompt('⏳ 模块1/4：初始化气缸伸出状态...');
          } else {
            console.error('[评分] Modbus连接验证失败:', result.error);
            setScoringPrompt('❌ Modbus连接失败，请检查PLC连接后重试');
            setScoringRunning(false);
          }
        } catch (e) {
          console.error('[评分] Modbus连接验证异常:', e);
          setScoringPrompt('❌ Modbus通信异常，请检查PLC连接后重试');
          setScoringRunning(false);
        }
        break;
      }

      case 'M1_INITIALIZE': {
        const ok1 = await writeCoilWithRetry(A.FEED_CTRL, true);
        const ok2 = await writeCoilWithRetry(A.SORT1_CTRL, true);
        const ok3 = await writeCoilWithRetry(A.SORT2_CTRL, true);
        if (!ok1 || !ok2 || !ok3) {
          console.error('[评分] 初始化气缸伸出状态部分失败:', { ok1, ok2, ok3 });
          setScoringPrompt('❌ 气缸初始化写入失败，请检查PLC连接后重试');
          setScoringRunning(false);
          break;
        }
        useDeviceStore.setState(() => ({
          cylinders: {
            feed: { extended: true, currentExtension: CYLINDER_EXTEND_POS_FEED },
            sorting1: { extended: true, currentExtension: CYLINDER_EXTEND_POS_SORT },
            sorting2: { extended: true, currentExtension: CYLINDER_EXTEND_POS_SORT },
          },
        }));
        stepRef.current = 'M1_SEND_RESET';
        timerRef.current = now;
        await new Promise(r => setTimeout(r, 600));
        await updateCoils();
        setScoringPrompt('⏳ 模块1/4：发送复位信号...');
        break;
      }

      case 'M1_SEND_RESET': {
        await updateCoils();
        captureStepEntry();
        const ok = await sendPulse(A.RESET);
        if (ok) {
          pass('m1_btn', '【复位测试】复位按钮检测', 2);
        } else {
          fail('m1_btn', '【复位测试】复位信号发送失败(Modbus写入超时)', 2);
          moduleFailedRef.current = 0;
          skipModule(0);
          stepRef.current = 'M2_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：上料流程 — 发送启动信号...');
          break;
        }
        stepRef.current = 'M1_WAIT_CYLINDERS';
        timerRef.current = now;
        setScoringPrompt('⏳ 模块1/4：复位测试 — 检测PLC响应中...');
        break;
      }

      case 'M1_WAIT_CYLINDERS': {
        if (!f) break;
        const { cur, prev } = f;

        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.FEED_CTRL))
          pass('m1_feed_ctrl', '【复位测试】上料气缸缩回控制信号(单电控失电)', 4);
        if (active(cur, A.FEED_IN))
          pass('m1_feed_in', '【复位测试】上料气缸缩回磁性开关到位', 3);
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.SORT1_CTRL))
          pass('m1_s1_ctrl', '【复位测试】分拣1气缸缩回控制信号(单电控失电)', 2);
        if (active(cur, A.SORT1_IN))
          pass('m1_s1_in', '【复位测试】分拣1气缸缩回磁性开关到位', 1);
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.SORT2_CTRL))
          pass('m1_s2_ctrl', '【复位测试】分拣2气缸缩回控制信号(单电控失电)', 2);
        if (active(cur, A.SORT2_IN))
          pass('m1_s2_in', '【复位测试】分拣2气缸缩回磁性开关到位', 1);
        if (active(cur, A.CONVEYOR))
          pass('m1_conv_start', '【复位测试】传送带清料运行启动', 3);
        if (active(cur, A.CONVEYOR))
          pass('m1_conv_run', '【复位测试】传送带清料持续运行', 2);

        const feedCtrlPassed = hasPassed('m1_feed_ctrl');
        const m1ReadyForTimer = [
          'm1_feed_ctrl',
          'm1_feed_in',
          'm1_s1_ctrl',
          'm1_s1_in',
          'm1_s2_ctrl',
          'm1_s2_in',
          'm1_conv_start',
          'm1_conv_run',
        ].every(hasPassed);

        if (now - timerRef.current > 8000) {
          if (!feedCtrlPassed) {
            fail('m1_feed_ctrl', '【复位测试】上料气缸缩回控制信号未触发', 4);
            moduleFailedRef.current = 0;
            skipModule(0);
            stepRef.current = 'M2_SEND_START';
            timerRef.current = now;
            setScoringPrompt('⏳ 模块2/4：上料流程 — 发送启动信号...');
          } else {
            const st = useDeviceStore.getState().scoringStatus;
            ['m1_feed_in','m1_s1_ctrl','m1_s1_in','m1_s2_ctrl','m1_s2_in','m1_conv_start','m1_conv_run'].forEach(id => {
              if (!st[id] || st[id] === 'pending') fail(id, `【复位测试】超时未完成`, SCORING_MODULES[0].subModules.flatMap(sm=>sm.items).find(i=>i.id===id)?.points ?? 0);
            });
            stepRef.current = 'M1_WAIT_CONVEYOR_STOP';
            timerRef.current = now;
            await updateCoils();
            captureStepEntry();
            setScoringPrompt('⏳ 模块1/4：等待传送带定时停止...');
          }
          break;
        }

        if (m1ReadyForTimer) {
          stepRef.current = 'M1_WAIT_CONVEYOR_STOP';
          timerRef.current = now;
          await updateCoils();
          captureStepEntry();
          setScoringPrompt('⏳ 模块1/4：等待传送带定时停止...');
        }
        break;
      }

      case 'M1_WAIT_CONVEYOR_STOP': {
        if (!f) break;
        const { cur } = f;
        if (becameInactive(cur, A.CONVEYOR)) {
          pass('m1_timer_stop', '【复位测试】传送带5秒定时器自动停止', 3);
          pass('m1_timer_hold', '【复位测试】传送带停止状态确认', 2);
          stepRef.current = 'M2_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：上料流程 — 发送启动信号...');
        } else if (now - timerRef.current > 8000) {
          fail('m1_timer_stop', '【复位测试】定时器未实现：传送带超时未停止', 3);
          fail('m1_timer_hold', '【复位测试】传送带停止状态确认', 2);
          stepRef.current = 'M2_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块2/4：上料流程 — 发送启动信号...');
        }
        break;
      }

      case 'M2_SEND_START': {
        await updateCoils();
        captureStepEntry();
        const ok = await sendPulse(A.START);
        if (ok) {
          pass('m2_btn', '【上料流程】启动按钮检测', 2);
        } else {
          fail('m2_btn', '【上料流程】启动信号发送失败(Modbus写入超时)', 2);
          moduleFailedRef.current = 1;
          skipModule(1);
          stepRef.current = 'M3_INJECT_BLACK';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
          break;
        }
        setScoringPrompt('⏳ 模块2/4：上料流程 — 检测PLC响应中...');
        useDeviceStore.setState(s => ({
          material: { ...s.material, visible: true, color: 'black', position: [-1.3, 1.06, 0.6] }
        }));
        stepRef.current = 'M2_WAIT_FEED_EXTEND';
        timerRef.current = now;
        break;
      }

      case 'M2_WAIT_FEED_EXTEND': {
        if (!f) break;
        const { cur } = f;
        if (active(cur, A.FEED_CTRL))
          pass('m2_feed_ctrl', '【上料流程】上料气缸伸出控制信号', 3);
        if (active(cur, A.FEED_OUT)) {
          pass('m2_feed_out', '【上料流程】上料气缸伸出磁性开关到位', 3);
          stepRef.current = 'M2_WAIT_FEED_RETRACT';
          timerRef.current = now;
          captureStepEntry();
        }
        if (now - timerRef.current > 10000) {
          const feedCtrlPassed = useDeviceStore.getState().scoringStatus['m2_feed_ctrl'] === 'passed';
          if (!feedCtrlPassed) {
            fail('m2_feed_ctrl', '【上料流程】上料气缸伸出控制信号未触发', 3);
            moduleFailedRef.current = 1;
            skipModule(1);
          } else {
            fail('m2_feed_out', '【上料流程】上料气缸伸出磁性开关未到位', 3);
            skipFollowUpSubModules(1);
          }
          stepRef.current = 'M3_INJECT_BLACK';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
        }
        break;
      }

      case 'M2_WAIT_FEED_RETRACT': {
        if (!f) break;
        const { cur, prev } = f;
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.FEED_CTRL))
          pass('m2_feed_ret_ctrl', '【上料流程】上料气缸缩回控制信号（伸出到位触发）', 4);
        if (active(cur, A.FEED_IN)) {
          pass('m2_feed_in', '【上料流程】上料气缸缩回磁性开关到位', 4);
          stepRef.current = 'M2_WAIT_CONVEYOR';
          timerRef.current = now;
          captureStepEntry();
        }
        if (now - timerRef.current > 8000) {
          const retCtrlPassed = useDeviceStore.getState().scoringStatus['m2_feed_ret_ctrl'] === 'passed';
          if (!retCtrlPassed) {
            fail('m2_feed_ret_ctrl', '【上料流程】上料气缸缩回控制信号未触发', 4);
            moduleFailedRef.current = 1;
            skipFollowUpSubModules(1);
          } else {
            fail('m2_feed_in', '【上料流程】上料气缸缩回磁性开关未到位', 4);
            skipFollowUpSubModules(1);
          }
          stepRef.current = 'M3_INJECT_BLACK';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
        }
        break;
      }

      case 'M2_WAIT_CONVEYOR': {
        if (!f) break;
        const { cur } = f;
        if (active(cur, A.FEED_SENSOR) || useDeviceStore.getState().sensors.feed)
          pass('m2_sensor', '【上料流程】上料传感器检测到物料', 4);
        if (active(cur, A.CONVEYOR))
          pass('m2_conv_start', '【上料流程】传送带联动启动', 3);
        if (active(cur, A.CONVEYOR))
          pass('m2_conv_run', '【上料流程】传送带持续运行', 2);
        if (useDeviceStore.getState().scoringStatus['m2_conv_run'] === 'passed') {
          stepRef.current = 'M3_INJECT_BLACK';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
        }
        if (now - timerRef.current > 10000) {
          const convStartPassed = useDeviceStore.getState().scoringStatus['m2_conv_start'] === 'passed';
          if (!convStartPassed) {
            fail('m2_conv_start', '【上料流程】传送带未联动启动', 3);
            fail('m2_conv_run', '【上料流程】传送带持续运行', 2);
          }
          stepRef.current = 'M3_INJECT_BLACK';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
        }
        break;
      }

      case 'M3_INJECT_BLACK': {
        await updateCoils();
        useDeviceStore.setState(s => ({
          material: { ...s.material, visible: true, color: 'black', position: [-0.3, 1.06, 0] }
        }));
        stepRef.current = 'M3_WAIT_COLOR_SENSOR';
        timerRef.current = now;
        captureStepEntry();
        setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 等待色标传感器...');
        break;
      }

      case 'M3_WAIT_COLOR_SENSOR': {
        if (!f) break;
        const { cur } = f;
        if (active(cur, A.COLOR_SENSOR) || useDeviceStore.getState().sensors.color)
          pass('m3_color', '【黑色分拣】色标传感器触发检测', 4);
        if (becameInactive(cur, A.CONVEYOR))
          pass('m3_conv_stop', '【黑色分拣】传送带在色标传感器触发后停止', 4);
        if (!active(cur, A.CONVEYOR) && useDeviceStore.getState().scoringStatus['m3_conv_stop'] === 'passed')
          pass('m3_conv_hold', '【黑色分拣】传送带停止状态确认', 3);
        if (useDeviceStore.getState().scoringStatus['m3_conv_hold'] === 'passed') {
          stepRef.current = 'M3_WAIT_SORT1_EXTEND';
          timerRef.current = now;
          captureStepEntry();
          setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 等待分拣1气缸动作...');
        }
        if (now - timerRef.current > 12000) {
          const colorPassed = useDeviceStore.getState().scoringStatus['m3_color'] === 'passed';
          if (!colorPassed) {
            fail('m3_color', '【黑色分拣】色标传感器未触发', 4);
            moduleFailedRef.current = 2;
            skipModule(2);
          } else {
            const convStopPassed = useDeviceStore.getState().scoringStatus['m3_conv_stop'] === 'passed';
            if (!convStopPassed) {
              fail('m3_conv_stop', '【黑色分拣】传送带未停止', 4);
              fail('m3_conv_hold', '【黑色分拣】传送带停止状态确认', 3);
              moduleFailedRef.current = 2;
              skipFollowUpSubModules(2);
            }
          }
          stepRef.current = 'M4_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 发送启动信号...');
        }
        break;
      }

      case 'M3_WAIT_SORT1_EXTEND': {
        if (!f) break;
        const { cur } = f;
        if (active(cur, A.SORT1_CTRL))
          pass('m3_s1_ctrl', '【黑色分拣】分拣1气缸伸出控制信号', 4);
        if (active(cur, A.SORT1_OUT)) {
          pass('m3_s1_out', '【黑色分拣】分拣1气缸伸出磁性开关到位', 4);
          stepRef.current = 'M3_WAIT_SORT1_RETRACT';
          timerRef.current = now;
          captureStepEntry();
        }
        if (now - timerRef.current > 8000) {
          const s1CtrlPassed = useDeviceStore.getState().scoringStatus['m3_s1_ctrl'] === 'passed';
          if (!s1CtrlPassed) {
            fail('m3_s1_ctrl', '【黑色分拣】分拣1气缸伸出控制信号未触发', 4);
            moduleFailedRef.current = 2;
            skipFollowUpSubModules(2);
          } else {
            fail('m3_s1_out', '【黑色分拣】分拣1气缸伸出磁性开关未到位', 4);
            skipSubModule(2, 'M3S2');
          }
          stepRef.current = 'M4_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 发送启动信号...');
        }
        break;
      }

      case 'M3_WAIT_SORT1_RETRACT': {
        if (!f) break;
        const { cur, prev } = f;
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.SORT1_CTRL))
          pass('m3_s1_ret_ctrl', '【黑色分拣】分拣1气缸缩回控制信号（伸出到位触发）', 3);
        if (active(cur, A.SORT1_IN)) {
          pass('m3_s1_in', '【黑色分拣】分拣1气缸缩回磁性开关到位', 3);
          useDeviceStore.getState().clearMaterial();
          stepRef.current = 'M4_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 发送启动信号...');
        }
        if (now - timerRef.current > 8000) {
          const retCtrlPassed = useDeviceStore.getState().scoringStatus['m3_s1_ret_ctrl'] === 'passed';
          if (!retCtrlPassed) {
            fail('m3_s1_ret_ctrl', '【黑色分拣】分拣1气缸缩回控制信号未触发', 3);
          }
          fail('m3_s1_in', '【黑色分拣】分拣1气缸缩回磁性开关未到位', 3);
          stepRef.current = 'M4_SEND_START';
          timerRef.current = now;
          setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 发送启动信号...');
        }
        break;
      }

      case 'M4_SEND_START': {
        await updateCoils();
        captureStepEntry();
        const ok = await sendPulse(A.START);
        if (ok) {
          pass('m4_btn', '【蓝色分拣】启动按钮检测（第二轮）', 1);
        } else {
          fail('m4_btn', '【蓝色分拣】启动信号发送失败(Modbus写入超时)', 1);
          moduleFailedRef.current = 3;
          skipModule(3);
          stepRef.current = 'FINISHED';
          setScoringPrompt('🏁 评分结束');
          break;
        }
        setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 检测PLC响应中...');
        useDeviceStore.setState(s => ({
          material: { ...s.material, visible: true, color: 'blue', position: [-1.3, 1.06, 0.6] }
        }));
        stepRef.current = 'M4_WAIT_LOAD';
        timerRef.current = now;
        break;
      }

      case 'M4_WAIT_LOAD': {
        if (!f) break;
        const { cur, prev } = f;
        if (active(cur, A.FEED_CTRL))
          pass('m4_feed_ctrl', '【蓝色分拣】上料气缸伸出控制（重复）', 1);
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.FEED_CTRL))
          pass('m4_feed_ret', '【蓝色分拣】上料气缸缩回控制（重复）', 1);
        if (active(cur, A.FEED_SENSOR) || useDeviceStore.getState().sensors.feed)
          pass('m4_sensor', '【蓝色分拣】上料传感器检测（重复）', 1);
        if (active(cur, A.CONVEYOR))
          pass('m4_conv', '【蓝色分拣】传送带启动（重复）', 1);
        const m4LoadReady = ['m4_feed_ctrl', 'm4_feed_ret', 'm4_sensor', 'm4_conv'].every(hasPassed);
        if (m4LoadReady) {
          useDeviceStore.setState(s => ({
            material: { ...s.material, position: [-0.3, 1.06, 0] }
          }));
          stepRef.current = 'M4_WAIT_COLOR_PASS';
          timerRef.current = now;
          captureStepEntry();
          setScoringPrompt('⏳ 模块4/4：蓝色物料运输中...');
        }
        if (now - timerRef.current > 12000) {
          const st = useDeviceStore.getState().scoringStatus;
          ['m4_feed_ctrl', 'm4_feed_ret', 'm4_sensor', 'm4_conv'].forEach(id => {
            if (!st[id] || st[id] === 'pending') {
              fail(id, `【蓝色分拣】超时未完成`, SCORING_MODULES[3].subModules.flatMap(sm => sm.items).find(i => i.id === id)?.points ?? 0);
            }
          });
          stepRef.current = 'M4_INJECT_BLUE';
          timerRef.current = now;
        }
        break;
      }

      case 'M4_INJECT_BLUE': {
        await updateCoils();
        useDeviceStore.setState(s => ({
          material: { ...s.material, visible: true, color: 'blue', position: [-0.3, 1.06, 0] }
        }));
        stepRef.current = 'M4_WAIT_COLOR_PASS';
        timerRef.current = now;
        captureStepEntry();
        setScoringPrompt('⏳ 模块4/4：蓝色物料运输中...');
        break;
      }

      case 'M4_WAIT_COLOR_PASS': {
        if (!f) break;
        const { cur } = f;
        const storeSensors = useDeviceStore.getState().sensors;
        if (!active(cur, A.COLOR_SENSOR) && !storeSensors.color)
          pass('m4_no_color', '【蓝色分拣】色标传感器未触发验证（互锁正确）', 2);
        if (active(cur, A.MATERIAL_SENSOR) || storeSensors.material) {
          pass('m4_mat_sensor', '【蓝色分拣】物料传感器检测到蓝色物料', 3);
          useDeviceStore.setState(s => ({
            material: { ...s.material, position: [0.6, 1.06, 0] }
          }));
        }
        if (useDeviceStore.getState().scoringStatus['m4_mat_sensor'] === 'passed' && !active(cur, A.CONVEYOR)) {
          pass('m4_conv_stop', '【蓝色分拣】物料传感器触发后传送带停止', 3);
          pass('m4_conv_hold', '【蓝色分拣】传送带停止状态确认', 2);
          stepRef.current = 'M4_WAIT_SORT2_EXTEND';
          timerRef.current = now;
          captureStepEntry();
          setScoringPrompt('⏳ 模块4/4：等待分拣2气缸动作...');
        }
        if (now - timerRef.current > 15000) {
          const matSensorPassed = useDeviceStore.getState().scoringStatus['m4_mat_sensor'] === 'passed';
          if (!matSensorPassed) {
            fail('m4_mat_sensor', '【蓝色分拣】物料传感器未触发', 3);
            moduleFailedRef.current = 3;
            skipFollowUpSubModules(3);
          } else {
            fail('m4_conv_stop', '【蓝色分拣】传送带未停止', 3);
            fail('m4_conv_hold', '【蓝色分拣】传送带停止状态确认', 2);
            skipFollowUpSubModules(3);
          }
          stepRef.current = 'FINISHED';
          timerRef.current = now;
          setScoringPrompt('🏁 评分结束');
        }
        break;
      }

      case 'M4_WAIT_SORT2_EXTEND': {
        if (!f) break;
        const { cur } = f;
        if (!active(cur, A.SORT1_OUT))
          pass('m4_no_s1', '【蓝色分拣】分拣1气缸未误触发（互锁正确）', 1);
        if (active(cur, A.SORT2_CTRL))
          pass('m4_s2_ctrl', '【蓝色分拣】分拣2气缸伸出控制信号', 4);
        if (active(cur, A.SORT2_OUT)) {
          pass('m4_s2_out', '【蓝色分拣】分拣2气缸伸出磁性开关到位', 3);
          stepRef.current = 'M4_WAIT_SORT2_RETRACT';
          timerRef.current = now;
          captureStepEntry();
        }
        if (now - timerRef.current > 8000) {
          const s2CtrlPassed = useDeviceStore.getState().scoringStatus['m4_s2_ctrl'] === 'passed';
          if (!s2CtrlPassed) {
            fail('m4_s2_ctrl', '【蓝色分拣】分拣2气缸伸出控制信号未触发', 4);
          }
          fail('m4_s2_out', '【蓝色分拣】分拣2气缸伸出磁性开关未到位', 3);
          stepRef.current = 'FINISHED';
          setScoringPrompt('🏁 评分结束');
        }
        break;
      }

      case 'M4_WAIT_SORT2_RETRACT': {
        if (!f) break;
        const { cur, prev } = f;
        if (isSingleCoilRetractCommandSatisfied(cur, prev, A.SORT2_CTRL))
          pass('m4_s2_ret_ctrl', '【蓝色分拣】分拣2气缸缩回控制信号（伸出到位触发）', 2);
        if (active(cur, A.SORT2_IN)) {
          useDeviceStore.getState().clearMaterial();
          stepRef.current = 'FINISHED';
          setScoringPrompt('🏁 评分结束');
        }
        if (now - timerRef.current > 8000) {
          fail('m4_s2_ret_ctrl', '【蓝色分拣】分拣2气缸缩回控制信号未触发', 2);
          stepRef.current = 'FINISHED';
          setScoringPrompt('🏁 评分结束');
        }
        break;
      }

      case 'FINISHED': {
        const st = useDeviceStore.getState().scoringStatus;
        const allItems = SCORING_MODULES.flatMap(m => m.subModules.flatMap(sm => sm.items));
        const pendingItems = allItems.filter(i => !st[i.id] || st[i.id] === 'pending');
        if (pendingItems.length > 0) {
          markItemsSkipped(pendingItems.map(i => ({ itemId: i.id, label: i.name, points: i.points })));
        }
        setScoringComplete(true);
        setScoringPrompt('🏁 评分结束');
        break;
      }
    }
  }

  function getModuleIndex(step: Step): number {
    if (step.startsWith('M1')) return 0;
    if (step.startsWith('M2')) return 1;
    if (step.startsWith('M3')) return 2;
    if (step.startsWith('M4')) return 3;
    return -1;
  }

  function advanceToNextModule(currentIdx: number): void {
    const now = Date.now();
    switch (currentIdx) {
      case 0:
        stepRef.current = 'M2_SEND_START';
        setScoringPrompt('⏳ 模块2/4：上料流程 — 发送启动信号...');
        break;
      case 1:
        stepRef.current = 'M3_INJECT_BLACK';
        setScoringPrompt('⏳ 模块3/4：黑色物料分拣 — 准备中...');
        break;
      case 2:
        stepRef.current = 'M4_SEND_START';
        setScoringPrompt('⏳ 模块4/4：蓝色物料分拣 — 发送启动信号...');
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
  }

  return null;
}
