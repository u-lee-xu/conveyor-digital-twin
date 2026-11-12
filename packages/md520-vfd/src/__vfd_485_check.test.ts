/**
 * ③ B 档真实 485 主从防回退自检：
 * 独立纯从站 :1508、真实 Modbus 主站轮询、端口隔离、前端可切换预设。
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

describe('B 档独立 485 从站', () => {
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

describe('真实 Modbus 主站轮询', () => {
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
    // 2000H 无 0 档：停机写 6、运行写 1
    expect(master).toContain('const command = running ? 1 : 6');
  });

  it('外部 PLC 可独占从站：DT_VFD_485_MASTER=0 关闭内置主站', () => {
    expect(startLab).toContain("process.env.DT_VFD_485_MASTER !== '0'");
    expect(master).toContain('DT_VFD_485_MASTER=0');
  });
});

describe('启动、检查与前端接线', () => {
  it('默认 8 进程 / 10 口，端口互不相同；龙门本机靶机按需启用', () => {
    // 龙门仿真模式改为对接外部 PLC 仿真软件 :502，内置靶机默认不启
    expect(startLab).toContain('默认起 8 个进程');
    expect(startLab).toContain('1508 / 5088');
    expect(startLab).toContain('DT_ENABLE_GANTRY_MOCK');
    expect(startLab).toContain('B 档 485 从站端口不能与');
    expect(startLab).toContain("launch('MD520 B 档 485 从站 :1508'");
    expect(startLab).toContain("launch('MD520 485 主站轮询'");
  });

  it('地址表自检含第 12 项 B 档检查', () => {
    expect(checkScript).toContain('function checkVfd485Slave()');
    expect(checkScript).toContain('ok = checkVfd485Slave() && ok;');
  });

  it('连接面板可切到 B 档独立从站', () => {
    expect(conn).toContain('MD520 485 从站 B档 (Modbus)');
    expect(conn).toContain('port: 1508');
    // 默认教学虚拟 PLC :1507 仍是第一个预设，保证零回归
    expect(conn).toContain('port: 1507');
    expect(conn.indexOf('port: 1507')).toBeLessThan(conn.indexOf('port: 1508'));
  });
});
