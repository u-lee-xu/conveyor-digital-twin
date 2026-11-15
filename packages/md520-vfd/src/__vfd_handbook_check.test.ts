/**
 * ② 教学资料防回退自检：手册必须与源码单一来源保持同步，
 * 并覆盖故障码、接线图、三协议点位、现场接入与边界声明。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MD520_PARAMS, MD520_COMM, MD520_FAULTS } from './vfd/md520Spec';
import { MD520_HOLDING_REGISTERS } from './constants/md520-addresses';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
const bookPath = join(docs, 'MD520教学手册.html');
const genPath = join(docs, 'generate-handbook.cjs');

describe('MD520 教学手册（② 教学资料）', () => {
  it('生成脚本与手册都存在，且手册是完整的自包含 HTML', () => {
    expect(existsSync(genPath)).toBe(true);
    expect(existsSync(bookPath)).toBe(true);
    expect(statSync(bookPath).size).toBeGreaterThan(20000);
    const html = readFileSync(bookPath, 'utf8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('</html>');
    // 无外部依赖，便于离线打开与打印
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('https://cdn');
  });

  it('参数、通信字与故障码全部来自源码单一来源', () => {
    const html = readFileSync(bookPath, 'utf8');
    for (const p of MD520_PARAMS) expect(html).toContain(p.code);
    for (const name of Object.keys(MD520_HOLDING_REGISTERS)) expect(html).toContain(name);
    for (const f of MD520_FAULTS) expect(html).toContain(f.code);
    expect(html).toContain(`${MD520_PARAMS.length} 个 / ${new Set(MD520_PARAMS.map((p) => p.group)).size} 组`);
    const gen = readFileSync(genPath, 'utf8');
    expect(gen).toContain('src/vfd/md520Spec.ts');
    expect(gen).toContain('src/constants/md520-addresses.ts');
    expect(gen).toContain('src/constants/md520-io-vars.ts');
    expect(gen).toContain('MD520教学手册.html');
    expect(gen).toContain('MD520_FC_DEFAULT_PERCENT');
  });

  it('12 个章节与接线图齐全', () => {
    const html = readFileSync(bookPath, 'utf8');
    for (let i = 1; i <= 12; i += 1) expect(html).toContain(`id="s${i}"`);
    for (const t of ['12 外部 PLC 的 DI/AI 端子控制', 'F0-02=1', 'F0-03=2',
      'DI4', 'AI1', 'AI2', 'DI1~DI3', 'FC-00~FC-07', 'DT_PLC_HOSTS', 'npm run start:devlab']) {
      expect(html).toContain(t);
    }
    expect(html).toContain('<svg');
    for (const t of ['DI1', 'DI5', 'AI1', 'AI2', 'AO1', 'DO1', 'FM', 'T/A', '485+', '485-', 'STO1']) {
      expect(html).toContain(t);
    }
    expect(html).toContain('表 4-5');
  });

  it('三协议点位与现场接入坑位齐全', () => {
    const html = readFileSync(bookPath, 'utf8');
    for (const t of [
      'coils 130~134', 'M130.0~M134.0', 'Y0~Y4', 'M130~M134',
      'M140.0~M142.0', 'X0~X2', 'M140~M142',
      'MW1000~MW1014', 'D1000~D1014',
      'AutoShop', '博途', 'GX Works2', 'DT_PLC_HOSTS',
      'PUT/GET', '逻辑站号', 'MX Component', '实物 PLC',
    ]) expect(html).toContain(t);
  });

  it('关键口径与边界声明齐全', () => {
    const html = readFileSync(bookPath, 'utf8');
    for (const t of [
      '2000H 控制命令没有 0 档', '写 0 无意义', '1000H', '7310H', '3000H', '7044H',
      '8000H', '1F01H', '09 参数手册', '教学子集', '教学近似',
      '独立设备场景', '只读', '零上行', '矢量控制算法',
    ]) expect(html).toContain(t);
    expect(MD520_COMM.COMMAND2).toBe(0x2000);
    expect(MD520_COMM.FAULT_DESC).toBe(0x8000);
  });
});
