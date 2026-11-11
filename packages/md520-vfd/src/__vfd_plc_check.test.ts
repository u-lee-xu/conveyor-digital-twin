/**
 * MD520 × PLC 双向通信防回退自检（场景独立版）。
 *
 * 固化：变频器从站只在传送带场景专属虚拟 PLC；自动配药 PLC 零耦合；
 * DIDO / AI / 485 三条接口、读写分离、默认停机不接管、观众只读镜像。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MD520_PARAMS, MD520_DI } from './vfd/md520Spec';
import { INITIAL_KEYPAD } from './vfd/md520Keypad';
import { useVfdStore } from './stores/useVfdStore';
import { MD520_HOLDING_REGISTERS } from './constants/md520-addresses';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(join(here, p), 'utf8');
const root = join(here, '../../..');
const rootSrc = (p: string) => readFileSync(join(root, p), 'utf8');

const defaults = Object.fromEntries(MD520_PARAMS.map((p) => [p.code, p.defaultValue]));

const conveyorPlc = rootSrc('websocket-server/mock-vfd-server.js');
const dispensingPlc = rootSrc('websocket-server/mock-dispensing-server.js');
const addressTable = rootSrc('websocket-server/mock-addresses.js');
const shared = rootSrc('packages/shared/src/services/modbus-websocket.ts');
const startLab = rootSrc('scripts/start-lab.cjs');
const link = src('platform/VfdLink.tsx');
const panel = src('platform/VfdKeypadPanel.tsx');
const spec = src('constants/md520-addresses.ts');

/** 解析 mock-addresses.js 的 VFD_REGISTERS 文本，避免 CJS/ESM 混用 */
function gatewayRegisters(): Record<string, number> {
  const block = addressTable.match(/const VFD_REGISTERS = \{([\s\S]*?)\n\};/)?.[1] ?? '';
  const out: Record<string, number> = {};
  for (const m of block.matchAll(/^\s*(\w+):\s*(\d+),/gm)) out[m[1]] = Number(m[2]);
  return out;
}

beforeEach(() => {
  useVfdStore.setState({
    params: { ...defaults },
    keypad: { ...INITIAL_KEYPAD },
    running: false,
    direction: 1,
    externalSetpointHz: 0,
    outputHz: 0,
    di: Object.fromEntries(MD520_DI.map((d) => [d.key, false])),
    doFlags: {},
    ai1: 0,
    ai2: 0,
    ai2Mode: 'voltage',
    faultCode: null,
    faultHistory: [],
    command: 0,
    status: 3,
    commOnline: false,
    message: '',
    engaged: false,
  });
});

describe('场景独立：变频器自己的虚拟 PLC 与已定稿场景互不共用', () => {
  it('变频器从站与 PLC 参考程序都在独立的 mock-vfd-server.js', () => {
    expect(conveyorPlc).toContain('vfdPlcScan');
    expect(conveyorPlc).toContain('setInterval(vfdPlcScan, 100)');
    expect(conveyorPlc).toContain('isVfdAddress');
    expect(conveyorPlc).toContain('VFD_REGISTERS');
    expect(conveyorPlc).toContain('setRegisterArray');
  });

  it('自动配药 PLC 不含任何变频器 / 传送带逻辑', () => {
    for (const token of ['isVfdAddress', 'vfdWords', 'VFD_ADDR_MIN', 'VFD_REGISTERS', 'MD520', 'vfd']) {
      expect(dispensingPlc).not.toContain(token);
    }
    expect(dispensingPlc).toContain('ENCODER_PULSES');
  });

  it('独立虚拟 PLC 不混入配药配方 / 编码器 / 分拣流程', () => {
    for (const token of ['DISPENSING_ADDRESSES', 'ENCODER_PULSES', 'recipe', 'MAGA_PULSE']) {
      expect(conveyorPlc).not.toContain(token);
    }
  });

  it('start:lab 独立启动变频器 PLC，端口与其它场景不混用', () => {
    expect(startLab).toContain('VFD_PLC_PORT = 1507');
    expect(startLab).toContain("path.join(WSS, 'mock-vfd-server.js')");
    expect(startLab).toContain("path.join(WSS, 'mock-dispensing-server.js')");
    expect(startLab).toContain("path.join(WSS, 'mock-conveyor-server.js')");
  });

  it('两个 PLC 都只绑回环', () => {
    expect(conveyorPlc).toContain("host: '127.0.0.1'");
    expect(conveyorPlc).toContain("httpServer.listen(HTTP_PORT, '127.0.0.1'");
    expect(dispensingPlc).toContain("host: '127.0.0.1'");
  });
});

describe('三处地址表同源：前端 spec / shared 数值通道 / 网关白名单', () => {
  const gw = gatewayRegisters();

  it('15 个专用寄存器逐键等值', () => {
    expect(Object.keys(gw)).toHaveLength(15);
    for (const [name, address] of Object.entries(MD520_HOLDING_REGISTERS)) {
      expect(gw[name]).toBe(address);
      expect(spec).toContain(`${name}: ${address}`);
      expect(shared).toContain(
        `${name}: { type: 'uint16', modbus: { address: ${address}, words: 1 }`,
      );
    }
  });

  it('DIDO / AI / 485 / 参数源四组地址都在表内', () => {
    expect(gw.VFD_DI_FLAGS).toBe(4104);
    expect(gw.VFD_DO_FLAGS).toBe(4105);
    expect(gw.VFD_AI1).toBe(4106);
    expect(gw.VFD_COMMAND2).toBe(8192);
    expect(gw.VFD_FREQ2).toBe(29456);
    expect(gw.VFD_PARAM_F0_02).toBe(61442);
    expect(gw.VFD_PARAM_F0_03).toBe(61443);
    expect(gw.VFD_PARAM_F0_10).toBe(61450);
  });
});

describe('PLC 参考程序：三条接口 + 读写分离 + 默认停机', () => {
  it('DIDO：PLC DO 写 1008H，变频器 DO 1009H 回读为 PLC DI', () => {
    expect(conveyorPlc).toContain('VFD_IO');
    expect(conveyorPlc).toContain('vfdWords.set(VR.VFD_DI_FLAGS');
    expect(conveyorPlc).toContain('VR.VFD_DO_FLAGS) ?? 0');
    expect(conveyorPlc).toContain('VFD_IO.DI_RUN');
  });

  it('AI：PLC AO 数值镜像写 100AH', () => {
    expect(conveyorPlc).toContain('PLC_AO1');
    expect(conveyorPlc).toContain('vfdWords.set(VR.VFD_AI1');
    expect(conveyorPlc).toContain('0.01V');
  });

  it('485：PLC 写命令 / 频率给定，读状态联锁；参数源只读', () => {
    expect(conveyorPlc).toContain('vfdWords.set(VR.VFD_COMMAND2');
    expect(conveyorPlc).toContain('vfdWords.set(VR.VFD_FREQ2');
    expect(conveyorPlc).toContain('vfdWords.set(VR.VFD_SETPOINT');
    expect(conveyorPlc).toContain('VR.VFD_PARAM_F0_02) ?? 0');
    expect(conveyorPlc).not.toContain('vfdWords.set(VR.VFD_STATUS1');
  });

  it('18.3 表 18-2：2000H 无 0 档，PLC 停机写 6（按 F6-10）', () => {
    expect(conveyorPlc).toContain('comm ? 1 : 6');
    expect(conveyorPlc).not.toContain('comm ? 1 : 0');
  });

  it('默认停机，不写运行命令也不置位 DI', () => {
    expect(conveyorPlc).toContain('let plcRunning = false');
    expect(conveyorPlc).toContain('const terminal = plcRunning && source === 1');
    expect(conveyorPlc).toContain('const comm = plcRunning && source === 2');
  });
});

describe('前端链路：参数源下发、给定消费、状态回写、零帧保护', () => {
  it('参数源只在变化时下发，状态字三个一帧写回', () => {
    expect(link).toContain('PARAM_NAMES');
    expect(link).toContain('STATUS_NAMES');
    expect(link).toContain('VFD_PARAM_F0_02');
    expect(link).toContain('VFD_DO_FLAGS');
    expect(link).toContain('paramFrame !== lastParams');
  });

  it('按 F0-02 只消费一路给定，面板档不覆盖本地', () => {
    expect(link).toContain('MD520_SOURCE.COMM');
    expect(link).toContain('MD520_SOURCE.TERMINAL');
    expect(link).toContain('setPlcFrame({ command, setpointHz })');
    expect(link).toContain('setPlcFrame({ diFlags, ai1: ai1V })');
  });

  it('PLC 默认停机的零帧跳过，保住手动 / 演示 / 评分额定带速', () => {
    expect(link).toContain('store.engaged');
    expect(link).toContain('零帧跳过');
    // 停机命令改成 6 后，不能再靠 command !== 0 判断 PLC 是否下达给定
    expect(link).toContain('runCommand');
    expect(link).toContain('MD520_COMMAND.FWD');
    expect(link).not.toContain('command !== 0');
  });

  it('观众端只读，UI 只加只读状态不写说明', () => {
    expect(panel).toContain('data-dt-vfd-plc');
    expect(panel).toContain('1008H DI');
    expect(panel).toContain('100AH');
    expect(panel).toContain('isViewerRuntime');
  });
});

describe('store：PLC 给定走同一入口，engaged 闩锁口径不变', () => {
  it('DI 位字与 AI 数值都经 setPlcFrame 进入 store 并接管带速', () => {
    useVfdStore.getState().setPlcFrame({ diFlags: 0b01001, ai1: 6.5 });
    const s = useVfdStore.getState();
    expect(s.di.DI1).toBe(true);
    expect(s.di.DI4).toBe(true);
    expect(s.di.DI2).toBe(false);
    expect(s.ai1).toBe(6.5);
    expect(s.engaged).toBe(true);
  });

  it('AI 超范围钳位到 -10~10V', () => {
    useVfdStore.getState().setPlcFrame({ ai1: 999 });
    expect(useVfdStore.getState().ai1).toBe(10);
    useVfdStore.getState().setPlcFrame({ ai1: -999 });
    expect(useVfdStore.getState().ai1).toBe(-10);
  });

  it('未接管时 speedFactor 恒 1，避免默认停机冻结整机带速', () => {
    expect(useVfdStore.getState().engaged).toBe(false);
    expect(useVfdStore.getState().speedFactor()).toBe(1);
    expect(useVfdStore.getState().outputFactor()).toBe(0);
  });

  it('观众端数值镜像仍带有限数守卫', () => {
    useVfdStore.getState().applyBroadcast({ VFD_AI1: 3.2, VFD_DI_FLAGS: 3 });
    const s = useVfdStore.getState();
    expect(s.ai1).toBe(3.2);
    expect(s.di.DI1).toBe(true);
    expect(s.di.DI2).toBe(true);
    useVfdStore.getState().applyBroadcast({ VFD_AI1: 'oops' as unknown as number });
    expect(useVfdStore.getState().ai1).toBe(3.2);
  });
});
