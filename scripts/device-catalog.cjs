#!/usr/bin/env node
/**
 * 场景包清单（Node 侧单一读取入口）。
 *
 * 与 packages/platform/src/deviceCatalog.ts 的 glob 发现规则保持一致：
 * 扫描 packages 下各子目录的 device.json，目录名必须等于 id，按 order 排序。
 * 自检、CDP、首屏产物断言都从这里取清单，不再各自硬编码设备数量或名称。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PACKAGES_DIR = path.resolve(__dirname, '..', 'packages');

function loadSceneDescriptors() {
  const list = [];
  for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(PACKAGES_DIR, entry.name, 'device.json');
    if (!fs.existsSync(file)) continue;
    const meta = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (meta.id !== entry.name) {
      throw new Error(`场景包 ${entry.name} 的 device.json id 必须等于目录名，当前为 ${meta.id}`);
    }
    if (!fs.existsSync(path.join(PACKAGES_DIR, entry.name, 'src', 'device.ts'))) {
      throw new Error(`场景包 ${entry.name} 缺少 src/device.ts 统一入口`);
    }
    list.push({ ...meta, pkg: entry.name });
  }
  return list.sort((a, b) =>
    (Number.isFinite(a.order) ? a.order : 999) - (Number.isFinite(b.order) ? b.order : 999));
}

module.exports = { loadSceneDescriptors, PACKAGES_DIR };
