/**
 * 场景开发文档一致性自检（随 8 包 vitest 运行）。
 *
 * 目的：防止 SCENE_DEVELOPMENT.md 成为与代码脱节的第二份真值。
 * 校验章节完整性、引用路径与命令是否真实存在、device.json 字段与
 * SceneDescriptor 接口是否一致，以及文档是否写死场景数量 / 名单。
 */
import { describe, it, expect } from 'vitest';
import { SCENE_DESCRIPTORS } from '../../platform/src/deviceCatalog';

// 该包 vite 配置把 node:fs 映射到 Electron renderer shim，用内建模块绕过
const fs = process.getBuiltinModule('fs')!;
const urlOf = (rel: string) => new URL(`../../../${rel}`, import.meta.url);
const read = (rel: string) => fs.readFileSync(urlOf(rel), 'utf8') as string;
const exists = (rel: string) => fs.existsSync(urlOf(rel));
const doc = read('SCENE_DEVELOPMENT.md');

describe('场景开发文档可投入使用', () => {
  it('存在且 10 章 + 3 附录齐全', () => {
    for (let i = 1; i <= 10; i += 1) expect(doc, `第 ${i} 章`).toContain(`## ${i}. `);
    for (const a of ['附录 A', '附录 B', '附录 C']) expect(doc, a).toContain(a);
    expect(doc).toContain('真值优先级');
    expect(doc).toContain('目标读者');
    expect(doc).toContain('运行时免构建热插拔当前未实现');
    expect(doc).toContain('达标判据');
  });

  it('引用的项目路径全部真实存在', () => {
    const refs = [...doc.matchAll(/`((?:packages|scripts|websocket-server)\/[^`\s]+|AGENTS\.md|README\.md|CODE_AUDIT_REVIEW[^`\s]*\.md)`/g)]
      .map((m) => m[1]);
    const paths = [...new Set(refs)].filter((p) => !/[<>*?]/.test(p) && !p.includes(' '));
    expect(paths.length).toBeGreaterThan(10);
    for (const p of paths) expect(exists(p), p).toBe(true);
  });

  it('验收命令引用的脚本全部存在', () => {
    const cmds = [...doc.matchAll(/node ((?:scripts|websocket-server)\/[^\s`]+\.cjs)/g)].map((m) => m[1]);
    expect(cmds.length).toBeGreaterThan(5);
    for (const p of cmds) expect(exists(p), p).toBe(true);
    for (const key of [
      'scripts/check-first-screen.cjs', 'scripts/cdp-first-screen-check.cjs',
      'scripts/cdp-viewer-sync-check.cjs', 'websocket-server/security-check.cjs',
      'websocket-server/mock-addresses.js', 'start:devlab',
    ]) expect(doc, key).toContain(key);
  });

  it('device.json 字段与 SceneDescriptor 接口逐项一致', () => {
    const catalog = read('packages/platform/src/deviceCatalog.ts');
    const blocks = [...catalog.matchAll(/export interface (?:DeviceMeta|SceneDescriptor)[^{]*\{([\s\S]*?)\n\}/g)]
      .map((m) => m[1]);
    expect(blocks.length).toBe(2);
    const declared = [...new Set(
      blocks.flatMap((b) => [...b.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1])),
    )].filter((f) => f !== 'pkg').sort();
    const schema = Object.keys(JSON.parse(read('packages/conveyor-sorting/device.json'))).sort();
    expect(schema).toEqual(declared);
    expect(SCENE_DESCRIPTORS.length).toBeGreaterThan(0);
  });

  it('自动发现口径与本地档案隔离（只校验入库文件）', () => {
    // 项目侧适配档案不入库，自检不能依赖本机文件；改校验文档自身与 .gitignore。
    expect(doc).toContain('自动发现');
    expect(doc).toContain('不入库');
    const ignore = read('.gitignore');
    expect(ignore).toMatch(/^\.workbuddy\/$/m);
    expect(ignore).toMatch(/^\.trae\/$/m);
    // 旧的手工接线清单不得回退，否则场景构建 skill 会去改平台壳派生配置
    expect(doc).not.toContain('加 import 与数组项');
    expect(doc).not.toContain('`resolve.alias` 加');
  });

  it('交付与收尾章覆盖记录、授权边界与两种部署形态', () => {
    const tail = doc.split('## 10. ')[1]?.split('## 附录 A')[0] ?? '';
    expect(tail).toContain('现场手工测');
    expect(tail).toContain('commit');
    expect(tail).toContain('start:lab');
    expect(tail).toContain('start:devlab');
    expect(tail).toContain('electron:build:win');
    expect(tail).toContain('不入库');
    expect(tail).toContain('交接清单');
  });

  it('不写死场景数量或名单，不复制未实现能力为可用', () => {
    expect(doc).not.toMatch(/共\s*\d+\s*个场景|\d+\s*个设备/);
    expect(doc).not.toContain("'conveyor-sorting', 'pneumatic-robot'");
    expect(doc).toContain('不覆盖');
    expect(doc).toContain('反模式');
  });
});
