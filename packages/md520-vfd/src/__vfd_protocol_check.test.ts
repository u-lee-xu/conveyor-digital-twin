/**
 * 实体 PLC 三协议 uint16 单字通道防回退自检。
 * 本机没有 PLCSIM / GX Simulator2，实机读写无法验收，这里锁死接线与地址同源。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MD520_HOLDING_REGISTERS, MD520_PROTOCOL_ADDRESSES } from './constants/md520-addresses';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../..');
const rootSrc = (p: string) => readFileSync(join(root, p), 'utf8');

const shared = rootSrc('packages/shared/src/services/modbus-websocket.ts');
const server = rootSrc('websocket-server/server.js');
const checkScript = rootSrc('websocket-server/mock-addresses.js');

const names = Object.keys(MD520_HOLDING_REGISTERS) as (keyof typeof MD520_HOLDING_REGISTERS)[];

describe('三协议 connect 都下发单字变量表', () => {
  it('modbus / s7 / mitsubishi 三个分支各有 wordVariables: CONNECT_WORDS', () => {
    expect((shared.match(/wordVariables: CONNECT_WORDS/g) || []).length).toBe(3);
  });

  it('15 个寄存器逐键带 modbus + s7 + mitsubishi 三套地址', () => {
    expect(names).toHaveLength(15);
    for (const name of names) {
      const a = MD520_PROTOCOL_ADDRESSES[name];
      const token = `${name}: { type: 'uint16', modbus: { address: ${MD520_HOLDING_REGISTERS[name]}, words: 1 }, s7: { address: '${a.s7}', words: 1 }, mitsubishi: { address: '${a.mitsubishi}', words: 1 } }`;
      expect(shared).toContain(token);
    }
  });

  it('S7 用 M 区字、三菱用 D 区，避开配药 D120·D121 与低位布尔区', () => {
    for (const name of names) {
      const a = MD520_PROTOCOL_ADDRESSES[name];
      expect(a.s7).toMatch(/^MW10\d\d$/);
      expect(a.mitsubishi).toMatch(/^D10\d\d$/);
      expect(Number(a.mitsubishi.slice(1))).toBeGreaterThanOrEqual(1000);
    }
    const s7Addrs = names.map((n) => MD520_PROTOCOL_ADDRESSES[n].s7);
    const mitsuAddrs = names.map((n) => MD520_PROTOCOL_ADDRESSES[n].mitsubishi);
    expect(new Set(s7Addrs).size).toBe(names.length);
    expect(new Set(mitsuAddrs).size).toBe(names.length);
  });
});

describe('网关按 spec.type 分流', () => {
  it('copyWordTable 允许 uint16 且强制 words===1', () => {
    expect(server).toContain("spec.type !== 'dint32' && spec.type !== 'uint16'");
    expect(server).toContain("if (copy.type === 'uint16' && words !== 1)");
  });

  it('S7 translation CB 把数值变量名翻成 s7 单字地址并注册进轮询', () => {
    expect(server).toContain("word && word.s7 && word.s7.address");
    expect(server).toContain('Object.keys(this.wordVariables)');
  });

  it('S7 writeWords 对 uint16 钳到 0~65535，DINT 仍走 clampDint32', () => {
    expect(server).toContain("spec && spec.type === 'uint16' ? toUnsigned16(v) : clampDint32(v)");
  });

  it('三菱 _wordDevices 单字只返回一个 D 寄存器', () => {
    expect(server).toContain("return spec.type === 'uint16' ? [`D${base}`] :");
  });

  it('三菱 readWords / writeWords 都按 uint16 分支，不再恒读写两个字', () => {
    expect(server).toContain('single: spec?.type');
    expect(server).toContain('values[s.name] = toUnsigned16(lo.value)');
    expect(server).toContain('words.push(toSigned16(toUnsigned16(values[i])))');
  });
});

describe('防回退检查已纳入地址表自检', () => {
  it('mock-addresses.js --check 含第 11 项 checkWordProtocolChain', () => {
    expect(checkScript).toContain('function checkWordProtocolChain()');
    expect(checkScript).toContain('ok = checkWordProtocolChain() && ok;');
  });
});
