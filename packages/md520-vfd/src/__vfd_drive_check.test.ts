/**
 * MD520 独立场景三维装置防回退自检。
 * 从传送带分拣第 7 展台迁入后，装置仍只认输出频率，不读任何其它场景的启停真值。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useVfdStore } from './stores/useVfdStore';
import { VFD_DRIVE_DETAIL } from './scenes/constants';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');
const root = join(here, '../../..');
const rootSrc = (p: string) => readFileSync(join(root, p), 'utf8');

const rig = src('scenes/vfd/PhysicsVfdDrive.tsx');
const scene = src('scenes/vfd/SceneContent.tsx');
const wrapper = src('platform/VfdSceneWrapper.tsx');
const index = src('index.ts');
const geometries = src('components/scene/shared/geometries.ts');
const materials = src('components/scene/shared/materials.ts');

describe('独立场景骨架', () => {
  it('平台壳注册了 MD520 独立设备', () => {
    const registry = rootSrc('packages/platform/src/registry.ts');
    expect(JSON.parse(rootSrc('packages/md520-vfd/device.json')).id).toBe('md520-vfd');
    expect(rootSrc('packages/md520-vfd/src/device.ts')).toContain('md520VfdDevice');
    expect(registry).toContain('import.meta.glob');
    expect(index).toContain("id: 'md520-vfd'");
    expect(index).toContain("name: 'MD520 变频器'");
  });

  it('三维装置由 SceneContent + 自定义 SceneWrapper 组成', () => {
    expect(scene).toContain('<PhysicsVfdDrive />');
    expect(wrapper).toContain('OrbitControls');
    expect(wrapper).toContain('minDistance={0.35}');
    expect(index).toContain('SceneWrapper: VfdSceneWrapper');
  });

  it('VFD_DRIVE_DETAIL 是尺寸唯一来源，几何与材质走单例', () => {
    expect(geometries).toContain("import { VFD_DRIVE_DETAIL as V }");
    expect(rig).toContain('VFD_DRIVE_DETAIL as V');
    expect(rig).toContain("from '../../components/scene/shared'");
    expect(materials).toContain('vfdLedRun');
    expect(VFD_DRIVE_DETAIL.MAX_RPS).toBe(2.6);
    expect(VFD_DRIVE_DETAIL.STRIPE_COUNT).toBe(10);
  });
});

describe('驱动口径：只认输出频率', () => {
  it('装置只读 outputFactor()，不读 conveyorRunning / speedFactor()', () => {
    expect(rig).toContain('s.outputFactor()');
    const visible = rig.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(visible).not.toContain('conveyorRunning');
    expect(visible).not.toContain('speedFactor()');
  });

  it('outputFactor 与 speedFactor 口径分离：未接管时 0 vs 1', () => {
    const s = useVfdStore.getState();
    expect(s.engaged).toBe(false);
    expect(s.speedFactor()).toBe(1);
    expect(s.outputFactor()).toBe(0);
  });

  it('LED 频率牌、三状态灯、风扇与皮带都由输出频率驱动', () => {
    expect(rig).toContain('updateDisplay(hz)');
    expect(rig).toContain('LED_ON');
    expect(rig).toContain('fanRef.current.rotation.z');
    expect(rig).toContain('beltPhase.current');
  });

  it('?debug=1 只读诊断钩子仍可用', () => {
    expect(rig).toContain('__dtVfdDrive');
    expect(rig).toContain('DEBUG_ENABLED');
    expect(rig).toContain('isViewerRuntime');
  });
});

describe('观众跟随与场景隔离', () => {
  it('快照沿用既有 VFD_* 数值键，观众端不自建通道', () => {
    expect(index).toContain('VFD_OUTPUT_HZ');
    expect(index).toContain('useVfdStore.getState().applyBroadcast(v)');
  });

  it('开发靶机 :1507 与其它场景 PLC 隔离，教学交付不依赖它', () => {
    const startLab = rootSrc('scripts/start-lab.cjs');
    expect(startLab).toContain('VFD_PLC_PORT = 1507');
    expect(startLab).toContain("path.join(WSS, 'mock-vfd-server.js')");
    const dispensing = rootSrc('websocket-server/mock-dispensing-server.js');
    const conveyor = rootSrc('websocket-server/mock-conveyor-server.js');
    for (const t of ['vfdWords', 'isVfdAddress', 'vfdPlcScan', 'MD520']) {
      expect(dispensing).not.toContain(t);
      expect(conveyor).not.toContain(t);
    }
  });
});
