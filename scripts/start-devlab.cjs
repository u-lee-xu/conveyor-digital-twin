#!/usr/bin/env node
/**
 * 开发 / 验收启动入口：与教学交付的 `npm run start:lab` 完全相同的实验室，
 * 只是显式启用内置虚拟 PLC 靶机（1503 / 1505 / 1507 / 1508）。
 *
 * 用途：在没有外部 PLC 仿真软件的环境里复跑
 *   security-check.cjs / plc-ports-check.cjs / plc-3d-link-check.cjs
 * 等帧级验收脚本。课堂交付请用 `npm run start:lab`（不含任何内置虚拟 PLC）。
 */
process.env.DT_ENABLE_MOCK = '1';
require('./start-lab.cjs');
