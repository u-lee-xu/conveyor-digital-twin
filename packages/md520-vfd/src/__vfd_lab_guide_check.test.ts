/**
 * 实验指导书防回退自检：30 个实验、6 类、每个实验五段结构、关键预期数值。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MD520_PARAMS } from './vfd/md520Spec';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '..', 'docs');
const guidePath = join(docs, 'MD520实验指导书.html');
const genPath = join(docs, 'generate-lab-guide.cjs');
const bookPath = join(docs, 'MD520教学手册.html');

describe('MD520 实验指导书', () => {
  it('生成脚本与指导书存在，且是自包含可打印 HTML', () => {
    expect(existsSync(genPath)).toBe(true);
    expect(existsSync(guidePath)).toBe(true);
    expect(statSync(guidePath).size).toBeGreaterThan(30000);
    const html = readFileSync(guidePath, 'utf8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('https://cdn');
    expect(html).toContain('@media print');
  });

  it('30 个实验 / 6 类，每个实验都有目的、步骤、预期现象、观察窗口、易错点', () => {
    const html = readFileSync(guidePath, 'utf8');
    for (let n = 1; n <= 30; n += 1) expect(html).toContain(`id="lab${n}"`);
    for (const g of ['A', 'B', 'C', 'D', 'E', 'F']) expect(html).toContain(`id="grp${g}"`);
    expect((html.match(/<b>目的<\/b>/g) || []).length).toBe(30);
    expect((html.match(/<b>步骤<\/b>/g) || []).length).toBe(30);
    expect((html.match(/<b>预期现象<\/b>/g) || []).length).toBe(30);
    expect((html.match(/<b>观察窗口<\/b>/g) || []).length).toBe(30);
    expect((html.match(/<b>易错点<\/b>/g) || []).length).toBe(30);
  });

  it('预期现象带具体数值，且与代码实现一致', () => {
    const html = readFileSync(guidePath, 'utf8');
    for (const t of [
      '2.5Hz', '1 秒爬升 5Hz', '48.75', '43.75',
      '改成 10% → 5Hz', '0b01101=13', '9.00A', '3.70kW',
      '-0.83', '+1.21', '+0.023', '-0.034', '双断或双合停机',
    ]) expect(html).toContain(t);
  });

  it('关键地址、参数与端口口径齐全', () => {
    const html = readFileSync(guidePath, 'utf8');
    for (const t of [
      'F0-02', 'F0-03', 'F0-08', 'F0-10', 'F0-17', 'F0-18',
      'F4-00', 'F4-01', 'F4-02', 'F4-11', 'FC-00', 'FC-02', 'FD-01',
      '2000H', '7310H', '1000H', '3000H', '1008H', '1009H',
      '130~134', '140~142', 'M130.0~M134.0', 'MW1000~MW1014',
      'Y0~Y4', 'D1000~D1014', 'Modbus TCP :502', 'F0-02=2', 'F0-03=9',
      'DI1', 'DI2', 'AI1', 'DI1~DI3', 'npm run start:devlab', '教学交付不启动任何内置虚拟 PLC',
    ]) expect(html).toContain(t);
  });

  it('参数默认值从源码读取，指导书与手册互相引用', () => {
    const gen = readFileSync(genPath, 'utf8');
    expect(gen).toContain("src/vfd/md520Spec.ts");
    expect(gen).toContain('MD520_FC_DEFAULT_PERCENT');
    expect(gen).toContain('MD520实验指导书.html');
    expect(MD520_PARAMS).toHaveLength(24);
    const book = readFileSync(bookPath, 'utf8');
    expect(book).toContain('MD520实验指导书.html');
    const guide = readFileSync(guidePath, 'utf8');
    expect(guide).toContain('MD520教学手册.html');
    expect(guide).toContain('教学边界');
  });
});
