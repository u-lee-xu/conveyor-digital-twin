/**
 * 第 7 个部件展台「变频器驱动台」防回退自检。
 *
 * 固化用户 2026-11-11 定稿的四条口径：
 *  1. 展台骨架走 PART_STAGES/ASSEMBLY 数据驱动，整机 5 机位一个不动；
 *  2. 动画只认 useVfdStore.outputFactor()（输出频率 / 50Hz），不受 conveyorRunning 门控；
 *  3. 四种可视化齐全：LED 频率牌、柜体三灯、电机风扇/轴、短皮带与双滚筒；
 *  4. 观众端靠 VFD_OUTPUT_HZ 数值快照跟随，不自建 PLC 通道。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSEMBLY, PART_STAGES, PART_STAGE_ORIGIN, VFD_DRIVE_DETAIL as V } from './scenes/conveyor-sorting/constants';
import { useVfdStore } from './stores/useVfdStore';
import { INITIAL_KEYPAD } from './vfd/md520Keypad';
import { MD520_PARAMS } from './vfd/md520Spec';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');

const component = src('scenes/conveyor-sorting/components/PhysicsVfdDrive.tsx');
const scene = src('scenes/conveyor-sorting/SceneContent.tsx');
const constants = src('scenes/conveyor-sorting/constants.ts');
const geometries = src('components/scene/shared/geometries.ts');
const materials = src('components/scene/shared/materials.ts');
const store = src('stores/useVfdStore.ts');
const index = src('index.ts');

const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    externalSetpointHz: 50,
    outputHz: 0,
    engaged: false,
    commOnline: false,
    faultCode: null,
    command: 0,
    status: 3,
  });
});

describe('第 7 个展台骨架：数据驱动，整机不摆放', () => {
  it('PART_STAGES.drive 参数满足相机与网格约束', () => {
    const s = PART_STAGES.drive;
    expect(s.label).toBe('变频器驱动台');
    expect(s.camera).toHaveLength(3);
    expect(s.target).toHaveLength(3);
    expect(s.camera[1]).toBeGreaterThan(s.target[1]); // maxPolarAngle = π/2
    expect(s.fov).toBeGreaterThanOrEqual(30);
    expect(s.fov).toBeLessThanOrEqual(60);
    expect(s.grid / 0.1).toBe(Math.round(s.grid / 0.1));
    const d = Math.hypot(
      s.camera[0] - s.target[0], s.camera[1] - s.target[1], s.camera[2] - s.target[2],
    );
    expect(d).toBeGreaterThan(0.12);
    expect(d).toBeLessThan(20);
    // 与整机默认 -Z 机位同侧，柜体面板与外露风扇都朝向相机
    expect(s.camera[2]).toBeLessThan(0);
  });

  it('ASSEMBLY / PART_STAGE_ORIGIN 与展台键一致，整机场景不摆放驱动台', () => {
    expect(ASSEMBLY.drive.position).toEqual([0, 0, 0]);
    expect(ASSEMBLY.drive.origin.length).toBeGreaterThan(8);
    expect(PART_STAGE_ORIGIN.drive).toBe(ASSEMBLY.drive.origin);
    expect(constants).toContain("export type PartKind = 'belt' | 'cylinder' | 'sensor' | 'chute' | 'tower' | 'table' | 'drive';");
    expect(scene).toContain("case 'drive': return <PhysicsVfdDrive />;");
    // 整机 AssembledScene 的 6 个摆放项不含 drive
    const assembled = scene.slice(scene.indexOf('function AssembledScene'), scene.indexOf('function PartStageView'));
    expect(assembled).not.toContain("renderMountedPart('drive'");
  });

  it('VFD_DRIVE_DETAIL 是可见尺寸唯一来源，几何与材质走共享单例', () => {
    expect(V.BASE_W).toBeGreaterThan(V.BELT_LEN);
    expect(V.BELT_CENTER_X - V.ROLLER_DX).toBeCloseTo(V.MOTOR_X, 5); // 电机与左滚筒同轴
    expect(V.RPM_PER_HZ).toBe(30); // 4 极电机 50Hz → 1500rpm
    expect(geometries).toContain('VFD_DRIVE_DETAIL');
    ['vfdCabinet', 'vfdDisplay', 'vfdLed', 'vfdMotorBody', 'vfdMotorFinRing',
      'vfdFanBlade', 'vfdRoller', 'vfdBelt', 'vfdStripe'].forEach((g) => {
      expect(geometries, `缺几何 ${g}`).toContain(`${g}:`);
    });
    ['vfdCabinet', 'vfdDoor', 'vfdMotor', 'vfdStripe', 'vfdRoller', 'vfdRollerFace',
      'vfdLedOff', 'vfdLedRun', 'vfdLedFault', 'vfdLedComm'].forEach((m) => {
      expect(materials, `缺材质 ${m}`).toContain(`${m}:`);
    });
  });
});

describe('联动口径：只认变频器输出频率', () => {
  it('组件不读 conveyorRunning / speedFactor，只读 outputFactor', () => {
    // 与 __panel_copy_check.test.ts 同款：只检查可执行代码，注释里的口径说明不算
    const code = component
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).toContain('const s = useVfdStore.getState();');
    expect(code).toContain('const factor = s.outputFactor();');
    expect(code).not.toContain('conveyorRunning');
    expect(code).not.toContain('speedFactor()');
  });

  it('outputFactor 与 speedFactor 口径分离：未接管时 0 vs 1', () => {
    const s = useVfdStore.getState();
    expect(s.engaged).toBe(false);
    expect(s.speedFactor()).toBe(1);      // 整机带速保底
    expect(s.outputFactor()).toBe(0);     // 演示装置停机
    expect(store).toContain('outputFactor: () => {');
  });

  it('RUN 后两者一致，停机与故障都归零', () => {
    useVfdStore.getState().setParam('F0-17', 0.1);
    useVfdStore.getState().setParam('F0-18', 0.1);
    useVfdStore.getState().dispatchKey('RUN');
    for (let i = 0; i < 200; i += 1) useVfdStore.getState().tick(1 / 60);
    const s = useVfdStore.getState();
    expect(s.outputHz).toBeGreaterThan(0);
    expect(s.outputFactor()).toBeCloseTo(s.speedFactor(), 4);
    const full = s.outputFactor();
    useVfdStore.setState({ outputHz: 0 });
    expect(useVfdStore.getState().outputFactor()).toBe(0);
    useVfdStore.setState({ outputHz: 30, faultCode: 'E002.1' });
    expect(useVfdStore.getState().outputFactor()).toBe(0);
    expect(full).toBeGreaterThan(0);
  });

  it('观众端数值镜像后 outputFactor 跟着变，不自建 PLC 通道', () => {
    useVfdStore.getState().applyBroadcast({ VFD_OUTPUT_HZ: 25, VFD_ENGAGED: 1 });
    expect(useVfdStore.getState().outputFactor()).toBeCloseTo(0.5, 4);
    expect(index).toContain('VFD_OUTPUT_HZ');
    expect(index).toContain('useVfdStore.getState().applyBroadcast(v)');
  });
});

describe('四种可视化齐全', () => {
  it('LED 频率牌用 CanvasTexture 动态重绘，并换算 rpm', () => {
    expect(component).toContain('new THREE.CanvasTexture(canvas)');
    expect(component).toContain('texture.needsUpdate = true');
    expect(component).toContain('V.RPM_PER_HZ');
    expect(component).toContain('hz.toFixed(2)');
  });

  it('柜体三只状态灯按输出/故障/通讯切材质', () => {
    expect(component).toContain('LED_ON');
    expect(component).toContain('materials.vfdLedOff');
    expect(component).toContain('s.outputHz > 0.01 && !s.faultCode');
    expect(component).toContain('s.commOnline');
    expect(geometries).toContain('vfdLed:');
  });

  it('电机风扇与双滚筒共用一个角速度，皮带条纹循环平移', () => {
    expect(component).toContain('fanRef.current.rotation.z -= angle');
    expect(component).toContain('rollerRefs.current.forEach');
    expect(component).toContain('beltPhase.current += factor * V.BELT_SPEED * dt');
    expect(component).toContain('V.STRIPE_COUNT');
    expect(component).toContain('vfdFanBlade');
    expect(component).toContain('vfdCoupling');
  });

  it('CDP 只读诊断钩子按 ?debug=1 门控，不写 store / 不碰 PLC', () => {
    expect(component).toContain("new URLSearchParams(window.location.search).has('debug')");
    expect(component).toContain('__dtVfdDrive');
    expect(component).toContain('isViewerRuntime()');
    const code = component.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('dispatchKey');
    expect(code).not.toContain('setParam');
    expect(code).not.toContain('modbusService');
  });
});
