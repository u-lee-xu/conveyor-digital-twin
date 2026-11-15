/**
 * ③ 开发靶机与教学界面隔离防回退自检：
 * 内置 485 纯从站 / 真实主站轮询只用于开发验收，教学交付默认不启动，
 * 且 MD520 的仿真模式连接面板只列外部 PLC（Modbus TCP / S7 / 三菱或 DI/AI 端子）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MD520_HOLDING_REGISTERS } from './constants/md520-addresses';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const slave = read('websocket-server/mock-vfd-slave.js');
const master = read('websocket-server/vfd-485-master.cjs');
const startLab = read('scripts/start-lab.cjs');
const checkScript = read('websocket-server/mock-addresses.js');
const conn = read('packages/md520-vfd/src/platform/VfdPlcConnection.tsx');
const store = read('packages/md520-vfd/src/stores/useVfdAppStore.ts');

describe('开发靶机：独立 485 纯从站', () => {
  it('是纯从站：只响应主站帧，不含任何 PLC 参考程序', () => {
    expect(slave).toContain('pure-slave');
    expect(slave).toContain('VFD_REGISTERS');
    expect(slave).toContain('setRegisterArray');
    expect(slave).toContain('noteMasterWrite');
    expect(slave).not.toContain('vfdPlcScan');
    expect(slave).not.toContain('setInterval(vfdPlcScan');
  });

  it('默认停机：2000H 写 6（无 0 档）、3000H 状态 3', () => {
    expect(slave).toContain('words.set(VR.VFD_COMMAND2, 6)');
    expect(slave).toContain('words.set(VR.VFD_STATUS1, 3)');
    expect(MD520_HOLDING_REGISTERS.VFD_COMMAND2).toBe(0x2000);
    expect(MD520_HOLDING_REGISTERS.VFD_STATUS1).toBe(0x3000);
  });

  it('独立端口 / 独立状态口，全部绑回环', () => {
    expect(slave).toContain("'1508'");
    expect(slave).toContain("'5088'");
    expect(slave).toContain("host: '127.0.0.1'");
    expect(slave).toContain("httpServer.listen(HTTP_PORT, '127.0.0.1'");
    expect(startLab).toContain('VFD_SLAVE_PORT = 1508');
    expect(startLab).toContain('portBusy(VFD_SLAVE_PORT)');
  });
});

describe('开发靶机：真实 Modbus 主站轮询', () => {
  it('通过 TCP 帧读写，不直接改从站内存', () => {
    for (const token of ['connectTCP', 'writeRegister(', 'writeCoils(',
      'readHoldingRegisters(', 'readCoils(', 'client.setID']) {
      expect(master).toContain(token);
    }
    expect(master).not.toContain('require(\'./mock-vfd-slave.js\')');
  });

  it('写 2000H / 7310H / 1000H 与 DI coils，读 3000H / 1001H / 1009H', () => {
    for (const k of ['VFD_COMMAND2', 'VFD_FREQ2', 'VFD_SETPOINT',
      'VFD_STATUS1', 'VFD_RUN_FREQ', 'VFD_DO_FLAGS']) {
      expect(master).toContain(`VR.${k}`);
    }
    expect(master).toContain('writeCoils(130,');
    expect(master).toContain('readCoils(140, 3)');
    expect(master).toContain('const command = running ? 1 : 6');
  });

  it('外部 PLC 可独占从站：DT_VFD_485_MASTER=0 关闭内置主站', () => {
    expect(startLab).toContain("process.env.DT_VFD_485_MASTER !== '0'");
    expect(master).toContain('DT_VFD_485_MASTER=0');
  });
});

describe('教学交付与开发靶机隔离', () => {
  it('内置虚拟 PLC 默认不启动，仅 DT_ENABLE_MOCK 开发模式拉起', () => {
    expect(startLab).toContain('MOCK_ENABLED');
    expect(startLab).toContain('DT_ENABLE_MOCK');
    expect(startLab).toContain('if (MOCK_ENABLED)');
    expect(startLab).toContain("launch('MD520 B 档 485 从站 :1508'");
    expect(startLab).toContain("launch('MD520 485 主站轮询'");
    expect(startLab).toContain('B 档 485 从站端口不能与');
  });

  it('地址表自检含 B 档开发靶机检查', () => {
    expect(checkScript).toContain('function checkVfd485Slave()');
    expect(checkScript).toContain('ok = checkVfd485Slave() && ok;');
  });

  it('MD520 连接面板与默认配置只指向外部 PLC，不含内置虚拟 PLC', () => {
    expect(conn).toContain('port: 502');
    expect(conn).toContain('DI/AI');
    expect(conn).toContain('外部 PLC');
    expect(conn).not.toContain('port: 1507');
    expect(conn).not.toContain('port: 1508');
    expect(store).toContain('port: 502');
    expect(store).not.toContain('port: 1507');
  });
});
