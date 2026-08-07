import { useEffect, useState } from 'react';
import { useRobotStore } from '../useRobotStore';

/** 演示步骤 */
export type DemoStep =
  | 'IDLE'         // 待机
  | 'LOWER'        // 升降气缸下降（取料位）
  | 'GRAB'         // 夹爪夹紧拾取
  | 'RAISE'        // 升降气缸升起
  | 'ADVANCE'      // 前后气缸伸出（放料位）
  | 'LOWER_PLACE'  // 升降气缸下降（放料位）
  | 'OPEN'         // 夹爪张开释放
  | 'RAISE_BACK'   // 升降气缸升起
  | 'RETURN'       // 前后气缸缩回（回初始位）

export const STEP_LABELS: Record<DemoStep, string> = {
  IDLE: '待机',
  LOWER: '下降取料',
  GRAB: '夹取物料',
  RAISE: '升起',
  ADVANCE: '前进放料',
  LOWER_PLACE: '下降放料',
  OPEN: '放下物料',
  RAISE_BACK: '升起',
  RETURN: '回位',
};

/** 等待气缸到位/动作完成的阈值 */
const AT_POS = 0.92;    // 接近伸出
const AT_RETRACT = 0.08; // 接近缩回

interface DemoSimState {
  running: boolean;
  paused: boolean;
  step: DemoStep;
}

export function useDemoSim() {
  const [state, setState] = useState<DemoSimState>({ running: false, paused: false, step: 'IDLE' });

  // 推进器：按当前步骤等待气缸到位后进入下一步
  useEffect(() => {
    if (!state.running || state.paused) return;

    const timer = setInterval(() => {
      const s = useRobotStore.getState();
      const pos = s.cylinders;

      switch (state.step) {
        case 'LOWER':
          if (pos.lift.position >= AT_POS) {
            s.setCylinder('clamp', false);   // 夹紧（clamp: 0=夹紧, 1=张开）
            setState((p) => ({ ...p, step: 'GRAB' }));
          }
          break;

        case 'GRAB':
          if (s.workpiece.held && pos.clamp.position <= AT_RETRACT) {
            s.setCylinder('lift', false);
            setState((p) => ({ ...p, step: 'RAISE' }));
          }
          break;

        case 'RAISE':
          if (pos.lift.position <= AT_RETRACT) {
            s.setCylinder('forward', true);
            setState((p) => ({ ...p, step: 'ADVANCE' }));
          }
          break;

        case 'ADVANCE':
          if (pos.forward.position >= AT_POS) {
            s.setCylinder('lift', true);     // 下降至放料位
            setState((p) => ({ ...p, step: 'LOWER_PLACE' }));
          }
          break;

        case 'LOWER_PLACE':
          if (pos.lift.position >= AT_POS) {
            s.setCylinder('clamp', true);    // 张开释放（clamp: 0=夹紧, 1=张开）
            setState((p) => ({ ...p, step: 'OPEN' }));
          }
          break;

        case 'OPEN':
          if (pos.clamp.position >= AT_POS && !s.workpiece.held) {
            s.setCylinder('lift', false);    // 升起
            s.setIndicator('processing', false);
            s.setIndicator('home', true);
            setState((p) => ({ ...p, step: 'RAISE_BACK' }));
          }
          break;

        case 'RAISE_BACK':
          if (pos.lift.position <= AT_RETRACT) {
            s.setCylinder('forward', false); // 缩回回位
            setState((p) => ({ ...p, step: 'RETURN' }));
          }
          break;

        case 'RETURN':
          if (pos.forward.position <= AT_RETRACT) {
            // 清掉放料位残留，重新生成，进入下一轮
            s.cleanUpWorkpiece();
            s.spawnWorkpiece();
            s.setIndicator('processing', true);
            s.setIndicator('home', false);
            s.setCylinder('lift', true);
            setState((p) => ({ ...p, step: 'LOWER' }));
          }
          break;

        case 'IDLE':
        default:
          break;
      }
    }, 100);

    return () => clearInterval(timer);
  }, [state.running, state.paused, state.step]);

  const start = () => {
    const s = useRobotStore.getState();
    s.cleanUpWorkpiece();   // 清除放料位残留
    s.resetAll();           // 气缸/指示灯/工件复位
    s.spawnWorkpiece();     // 取料位生成物料
    s.setIndicator('running', true);
    s.setIndicator('processing', true);
    s.setIndicator('home', false);
    s.setCylinder('lift', true);   // 开始下降取料
    setState({ running: true, paused: false, step: 'LOWER' });
  };

  const stop = () => {
    useRobotStore.getState().resetAll();   // 气缸缩回、指示灯复位
    setState({ running: false, paused: false, step: 'IDLE' });
  };

  const pause = () => setState((p) => (p.running ? { ...p, paused: true } : p));
  const resume = () => setState((p) => (p.running ? { ...p, paused: false } : p));

  return { ...state, start, stop, pause, resume };
}
