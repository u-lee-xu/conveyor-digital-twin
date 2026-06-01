/**
 * ================================================
 * 文件名: useScoring.ts
 * 功能: 数字孪生传送带分拣系统 - 评分模式Hook
 * ================================================
 * 
 * 【文件关联关系】
 * - 依赖: react (useEffect, useRef, useCallback), ../stores/useDeviceStore, ../services/modbus
 * @deprecated 已被 useConveyorScoring.ts 替代，保留仅供参考
 * - 数据流向: Modbus数据 -> 评分逻辑 -> 更新评分状态
 * 
 * 【功能说明】
 * 本Hook实现评分模式的核心逻辑，用于测试和评估PLC程序：
 * 1. 自动测试流程控制（状态机）
 * 2. 实时评分监控（检测错误操作）
 * 3. 与PLC的Modbus通信
 * 4. 记录测试结果（通过项和扣分项）
 * 
 * 【评分规则】
 * - 初始满分: 100分
 * - 复位超时: -20分
 * - 分拣超时: -15分
 * - 空推气缸: -10分
 * - 分拣逻辑错误（推错颜色）: -20分
 * 
 * 【测试流程】
 * 1. 安全性校验 - 注入随机扰乱状态
 * 2. 复位流程 - 检测PLC是否能正确复位
 * 3. 黑色物料分拣测试
 * 4. 蓝色物料分拣测试
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDeviceStore } from '../stores';
import { MODBUS_ADDRESSES, MODBUS_CONFIG, useModbusService } from '../services/modbus';

/**
 * 评分模式状态机步骤定义
 */
type ScoringStep =
  | 'IDLE'               // 待机状态
  | 'RANDOMIZING'        // 注入随机扰乱状态
  | 'TRIGGER_RESET'      // 触发复位指令
  | 'WAITING_RESET_DONE' // 等待复位完成
  | 'PREPARING_CYCLE'    // 准备测试循环
  | 'TRIGGER_START'      // 触发启动指令
  | 'RUNNING'            // 运行中（等待物料处理完成）
  | 'FINISHED';          // 测试完成

/**
 * 评分模式Hook
 * 实现PLC程序的自动测试和评分逻辑
 */
export function useScoring() {
  const mode = useDeviceStore((state) => state.mode);
  const isScoringRunning = useDeviceStore((state) => state.isScoringRunning);
  const setScoringRunning = useDeviceStore((state) => state.setScoringRunning);
  const randomizeState = useDeviceStore((state) => state.randomizeState);
  const spawnMaterial = useDeviceStore((state) => state.spawnMaterial);
  const clearMaterial = useDeviceStore((state) => state.clearMaterial);
  const markScoringItem = useDeviceStore((state) => state.markScoringItem);
  const addPassedItem = useDeviceStore((state) => state.addPassedItem);
  const resetScore = useDeviceStore((state) => state.resetScore);

  const modbusServiceRef = useRef(useModbusService({
    host: MODBUS_CONFIG.host, port: MODBUS_CONFIG.port, unitId: MODBUS_CONFIG.unitId,
  }));
  const modbusService = modbusServiceRef.current;

  const stepRef = useRef<ScoringStep>('IDLE');
  const stateTimerRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const activeTimeoutsRef = useRef<number[]>([]);
  
  // 测试循环控制：0=测试黑色, 1=测试蓝色
  const cycleRef = useRef<number>(0);
  
  const safeTimeout = useCallback((fn: () => void, delay: number) => {
    const id = window.setTimeout(fn, delay);
    activeTimeoutsRef.current.push(id);
    return id;
  }, []);

  const clearAllTimeouts = useCallback(() => {
    activeTimeoutsRef.current.forEach(id => clearTimeout(id));
    activeTimeoutsRef.current = [];
  }, []);

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
      isProcessingRef.current = false;
      clearAllTimeouts();
      return;
    }

    clearMaterial(); 
    resetScore();
    cycleRef.current = 0;

    const runAutoTest = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        const { recordedTrace, material } = useDeviceStore.getState();
        if (recordedTrace.length === 0) return;

        const latestEntry = recordedTrace[recordedTrace.length - 1];
        const coils = latestEntry.coils;

        switch (stepRef.current) {
          case 'IDLE':
            randomizeState();
            addPassedItem('阶段 1/3：安全性校验 - 注入随机扰乱状态');
            stepRef.current = 'RANDOMIZING';
            stateTimerRef.current = Date.now();
            break;

          case 'RANDOMIZING':
            if (Date.now() - stateTimerRef.current > 1200) {
              stepRef.current = 'TRIGGER_RESET';
            }
            break;

          case 'TRIGGER_RESET':
            await modbusService.writeSignal(MODBUS_ADDRESSES.RESET, true);
            addPassedItem('阶段 1/3：复位流程 - 已下发 Reset 指令 (M1)');
            safeTimeout(() => modbusService.writeSignal(MODBUS_ADDRESSES.RESET, false), 800);
            stepRef.current = 'WAITING_RESET_DONE';
            stateTimerRef.current = Date.now();
            break;

          case 'WAITING_RESET_DONE':
            const allRetracted = coils[MODBUS_ADDRESSES.MAGNETIC_FEED_RETRACT] && 
                                 coils[MODBUS_ADDRESSES.MAGNETIC_SORTING1_RETRACT] && 
                                 coils[MODBUS_ADDRESSES.MAGNETIC_SORTING2_RETRACT];
            const conveyorStopped = !coils[MODBUS_ADDRESSES.CONVEYOR];
            
            if (allRetracted && conveyorStopped) {
              addPassedItem('阶段 1/3：复位成功 - 设备已处于安全初始位');
              stepRef.current = 'PREPARING_CYCLE';
            } else if (Date.now() - stateTimerRef.current > 15000) {
              markScoringItem('reset_timeout', 'failed', '复位逻辑超时（15秒内未完成复位动作）', 0);
              stepRef.current = 'FINISHED';
              setScoringRunning(false);
            }
            break;

          case 'PREPARING_CYCLE':
            const color = cycleRef.current === 0 ? 'black' : 'blue';
            addPassedItem(`阶段 ${cycleRef.current + 2}/3：开始${color === 'black' ? '黑色' : '蓝色'}物料分拣测试`);
            
            // 强制设置物料颜色进行测试
            useDeviceStore.setState((s) => ({
              material: { ...s.material, visible: true, color: color, position: [-1.3, 1.10, 0.6] }
            }));
            
            stepRef.current = 'TRIGGER_START';
            stateTimerRef.current = Date.now();
            break;

          case 'TRIGGER_START':
            if (Date.now() - stateTimerRef.current > 2000) {
              await modbusService.writeSignal(MODBUS_ADDRESSES.START, true);
              addPassedItem('阶段 2/3：启动流程 - 已下发 Start 指令 (M0)');
              safeTimeout(() => modbusService.writeSignal(MODBUS_ADDRESSES.START, false), 800);
              stepRef.current = 'RUNNING';
              stateTimerRef.current = Date.now();
            }
            break;

          case 'RUNNING':
            // 检查当前物料是否处理完成
            if (!material.visible && Date.now() - stateTimerRef.current > 4000) {
              const color = cycleRef.current === 0 ? 'black' : 'blue';
              addPassedItem(`✓ ${color === 'black' ? '黑色' : '蓝色'}物料分拣环节通过`);
              
              if (cycleRef.current === 0) {
                // 进入蓝色物料测试
                cycleRef.current = 1;
                stepRef.current = 'PREPARING_CYCLE';
              } else {
                // 全部测试完成
                stepRef.current = 'FINISHED';
                addPassedItem('阶段 3/3：全流程自动化测评圆满完成');
                safeTimeout(() => setScoringRunning(false), 2000);
              }
            } else if (Date.now() - stateTimerRef.current > 40000) {
              markScoringItem('sort_timeout', 'failed', '分拣单环节超时（40秒未检测到物料离场）', 0);
              stepRef.current = 'FINISHED';
              setScoringRunning(false);
            }
            break;
        }
      } catch (err) {
        console.error('[评分引擎] 运行异常:', err);
      } finally {
        isProcessingRef.current = false;
      }
    };

    const interval = setInterval(runAutoTest, 200);
    return () => {
      clearInterval(interval);
      clearAllTimeouts();
    };
  }, [isScoringRunning, randomizeState, resetScore, addPassedItem, modbusService, spawnMaterial, clearMaterial, setScoringRunning, markScoringItem, safeTimeout, clearAllTimeouts]);

  // 实时评分逻辑：处理联动、分拣正确性等
  useEffect(() => {
    if (mode !== 'scoring') return;

    const monitor = () => {
      const { recordedTrace, isScoringRunning, material } = useDeviceStore.getState();
      if (recordedTrace.length < 2 || !isScoringRunning) return;

      const current = recordedTrace[recordedTrace.length - 1].coils;
      const prev = recordedTrace[recordedTrace.length - 2].coils;

      // --- 1. 传送带联动检查 (仅检查逻辑，不计延时) ---
      // 如果物料在上料传感器处停留太久且传送带没动，这通常意味着逻辑缺失
      // 但根据要求，不计延时，只要传送带最终开了能把物料送走即可
      // 此处暂时移除实时扣分，改为依靠任务整体超时来判定逻辑失败

      // --- 2. 空推检查 ---
      if (current[MODBUS_ADDRESSES.FEED_CYLINDER_VALVE] && !prev[MODBUS_ADDRESSES.FEED_CYLINDER_VALVE]) {
        if (!material.visible) markScoringItem('empty_push', 'failed', '上料气缸异常空推（物料尚未就位）', 0);
      }

      // --- 3. 颜色分拣逻辑监控 (纯逻辑：推错了颜色即扣分) ---
      if (material.visible) {
        // 黑色物料判定
        if (material.color === 'black') {
          if (current[MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE] && !prev[MODBUS_ADDRESSES.SORTING2_CYLINDER_VALVE]) {
            markScoringItem('wrong_sort2_black', 'failed', '逻辑错误：黑色物料不应触发分拣气缸 2', 0);
          }
        }
        // 蓝色物料判定
        if (material.color === 'blue') {
          if (current[MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE] && !prev[MODBUS_ADDRESSES.SORTING1_CYLINDER_VALVE]) {
            markScoringItem('wrong_sort1_blue', 'failed', '逻辑错误：蓝色物料不应触发分拣气缸 1', 0);
          }
        }
      }
    };

    const interval = setInterval(monitor, 100);
    return () => clearInterval(interval);
  }, [mode, markScoringItem]);

  return null;
}
