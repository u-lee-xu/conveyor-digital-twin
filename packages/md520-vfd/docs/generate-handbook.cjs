#!/usr/bin/env node
/**
 * 生成《MD520 虚拟变频器教学手册》自包含 HTML。
 *
 * 参数表 / 通信地址 / 故障码全部从设备包源码读取，避免手册与代码不同步：
 *   src/vfd/md520Spec.ts        —— MD520_PARAMS / MD520_COMM / MD520_FAULTS
 *   src/constants/md520-addresses.ts —— 15 个接入网关的 uint16 字
 *   src/constants/md520-io-vars.ts   —— 三协议布尔点位
 *
 * 用法：node packages/md520-vfd/docs/generate-handbook.cjs
 * 输出：packages/md520-vfd/docs/MD520教学手册.html
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');
const spec = read('src/vfd/md520Spec.ts');
const addrSrc = read('src/constants/md520-addresses.ts');
const ioSrc = read('src/constants/md520-io-vars.ts');
const OUT = path.join(__dirname, 'MD520教学手册.html');

/** FC-00~FC-07 的默认值在源码里是 MD520_FC_DEFAULT_PERCENT[i]，这里展开成实际数值 */
const FC_DEFAULT = [0, 20, 40, 60, 80, 100, 70, 50];
const paramRe = /\{\s*code:\s*'([^']+)',\s*group:\s*'([^']+)',\s*index:\s*\d+,\s*name:\s*'([^']+)',\s*defaultValue:\s*([^,]+),\s*min:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+),\s*decimals:\s*\d+,\s*unit:\s*'([^']*)'([^\n]*)/g;
const params = [...spec.matchAll(paramRe)].map((m) => {
  let def = m[4].trim();
  const fc = def.match(/^MD520_FC_DEFAULT_PERCENT\[(\d+)\]$/);
  if (fc) def = String(FC_DEFAULT[Number(fc[1])]);
  return {
    code: m[1], group: m[2], name: m[3], def,
    min: m[5], max: m[6], unit: m[7],
    locked: false, readOnly: false,
  };
});
/** runLocked / readOnly 可能写在对象的下一行，按完整对象块判定而不是只看首行 */
for (const p of params) {
  const start = spec.indexOf(`{ code: '${p.code}'`);
  const next = spec.indexOf("{ code: '", start + 10);
  const block = spec.slice(start, next > 0 ? next : start + 400);
  p.locked = /runLocked:\s*true/.test(block);
  p.readOnly = /readOnly:\s*true/.test(block);
}

/** 真正参与计算的参数（其余只存值或只显示），与项目长期约定一致 */
const ACTIVE = new Set([
  'F0-02', 'F0-03', 'F0-08', 'F0-10', 'F0-17', 'F0-18',
  'F4-00', 'F4-01', 'F4-02', 'F4-03', 'F4-04', 'F4-11',
  'FD-01', 'U0-00',
  ...Array.from({ length: 8 }, (_v, i) => `FC-0${i}`),
]);

const wordRe = /^\s*(VFD_[A-Z0-9_]+):\s*(\d+),\s*\/\/\s*([^\n]*)/gm;
const words = [...addrSrc.matchAll(wordRe)].map((m) => ({ name: m[1], addr: Number(m[2]), note: m[3].trim() }));

const faultRe = /\{\s*code:\s*'(E[\d.]+)',\s*name:\s*'([^']+)'\s*\}/g;
const faults = [...spec.matchAll(faultRe)].map((m) => ({ code: m[1], name: m[2] }));

/** 18.3 表 8000H 变频器故障主码（用户手册 339~342 页） */
const FAULT_MAIN = [
  [2, '过流'], [5, '过压'], [8, '缓冲电源故障'], [9, '欠压故障'],
  [10, '变频器过载'], [11, '电机过载'], [12, '输入缺相'], [13, '输出缺相'],
  [14, '过热'], [15, '外部故障'], [17, '缓冲电路异常'], [18, '电流采样异常'],
  [19, '电机参数辨识异常'], [20, '编码器/PG卡异常'], [21, 'EEPROM故障'],
  [22, '编码器卡没激活'], [23, '输出对地短路'], [26, '累计运行时间到达'],
  [27, '用户自定义故障'], [28, '用户自定义警告'], [29, '累计上电时间到达'],
  [30, '输出掉载故障'], [31, 'PID反馈丢失'], [32, '参数异常'],
  [40, '逐波限流故障'], [42, '速度偏差过大'], [43, '电机超速'],
  [45, '电机过温'], [47, 'STO故障'], [51, '辨识磁极位置出错'], [55, '主从控制故障'],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const paramRows = params.map((p) => `<tr class="${ACTIVE.has(p.code) ? 'active' : ''}">
<td><code>${esc(p.code)}</code></td><td>${esc(p.name)}</td><td class="num">${esc(p.def)}</td>
<td class="num">${esc(p.min)} ~ ${esc(p.max)} ${esc(p.unit)}</td>
<td>${p.readOnly ? '只读' : p.locked ? '停机更改' : '可设'}</td>
<td>${ACTIVE.has(p.code) ? '<span class="tag-yes">生效</span>' : '<span class="tag-mirror">仅显示</span>'}</td></tr>`).join('\n');

const wordRows = words.map((w) => `<tr><td><code>${esc(w.name)}</code></td>
<td class="num">${w.addr}</td><td class="num">0x${w.addr.toString(16).toUpperCase().padStart(4, '0')}H</td>
<td>${esc(w.note)}</td></tr>`).join('\n');

const faultRows = faults.map((f) => `<tr><td><code>${esc(f.code)}</code></td><td>${esc(f.name)}</td>
<td>面板 STOP/RESET 或通信写 2000H=7 复位；先排除接线与铭牌参数</td></tr>`).join('\n');
const mainRows = FAULT_MAIN.map(([n, t]) => `<tr><td class="num">${n}</td><td>${esc(t)}</td></tr>`).join('\n');

/** 控制回路端子排示意（用户手册表 4-5 / 表 4-6） */
const term = (x, y, label, fill) => `<g><rect x="${x}" y="${y}" width="76" height="40" rx="4" fill="${fill}" stroke="#8995a1" stroke-width="1"/><text x="${x + 38}" y="${y + 25}" text-anchor="middle" font-size="12" font-family="monospace" fill="#1f2937">${label}</text></g>`;
const INPUTS = [
  ['+10V', '#f1efe8'], ['AI1', '#e6f1fb'], ['AI2', '#e6f1fb'], ['DI1', '#e1f5ee'],
  ['DI2', '#e1f5ee'], ['DI3', '#e1f5ee'], ['DI4', '#e1f5ee'], ['DI5', '#e1f5ee'],
  ['OP', '#f1efe8'], ['COM', '#f1efe8'],
];
const OUTPUTS = [
  ['AO1', '#e6f1fb'], ['DO1', '#faeeda'], ['FM', '#faeeda'], ['T/A', '#faeeda'],
  ['T/B', '#faeeda'], ['T/C', '#faeeda'], ['485+', '#eeedfe'], ['485-', '#eeedfe'], ['GND', '#f1efe8'],
];
const terminalSvg = `<svg viewBox="0 0 900 300" width="100%" role="img" xmlns="http://www.w3.org/2000/svg">
<title>MD520 控制回路端子分布示意</title>
<desc>上排是电源与输入端子，下排是输出与通信端子；绿色接 PLC 输出，橙色回 PLC 输入，蓝色为模拟量，紫色为 485 通信。</desc>
<text x="24" y="30" font-size="14" font-family="sans-serif" fill="#1f2937">控制回路端子排（教学示意，非实物尺寸）</text>
<rect x="24" y="48" width="852" height="212" rx="12" fill="#fbfcfe" stroke="#cbd5e1" stroke-width="1"/>
<text x="40" y="78" font-size="12" font-family="sans-serif" fill="#5b6675">输入侧</text>
${INPUTS.map(([n, c], i) => term(40 + i * 84, 88, n, c)).join('')}
<text x="40" y="176" font-size="12" font-family="sans-serif" fill="#5b6675">输出 / 通信侧</text>
${OUTPUTS.map(([n, c], i) => term(40 + i * 84, 186, n, c)).join('')}
<text x="40" y="284" font-size="12" font-family="sans-serif" fill="#5b6675">绿色 = PLC 输出驱动的 DI　橙色 = 回 PLC 输入的 DO　蓝色 = 模拟量　紫色 = RS485</text>
</svg>`;

const ioTable = `<tr><th>方向</th><th>变频器端子</th><th>Modbus TCP</th><th>Siemens S7</th><th>三菱仿真</th><th>三菱实物</th></tr>
<tr><td>PLC 输出 → 变频器</td><td>DI1~DI5</td><td>coils 130~134</td><td>M130.0~M134.0</td><td>Y0~Y4</td><td>M130~M134</td></tr>
<tr><td>变频器 → PLC 输入</td><td>DO1 / FM / RELAY</td><td>coils 140~142</td><td>M140.0~M142.0</td><td>X0~X2</td><td>M140~M142</td></tr>
<tr><td>模拟量 / 485</td><td>AI1 / AI2 / 485+ 485-</td><td>100AH / 900 / 15 个字</td><td>MW1000~MW1014</td><td>D1000~D1014</td><td>D1000~D1014</td></tr>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MD520 虚拟变频器教学手册</title>
<style>
:root{--ink:#1f2937;--soft:#5b6675;--line:#dfe5ec;--accent:#1d4ed8;--ok:#0f7b46;--warn:#b45309;--bg:#f7f9fc}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1080px;margin:0 auto;padding:28px 24px 70px}
header{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:22px}
h1{font-size:28px;margin:0 0 8px}
h2{font-size:19px;margin:0 0 14px;padding-left:11px;border-left:4px solid var(--accent)}
h3{font-size:15px;margin:20px 0 8px;color:var(--accent)}
p{margin:8px 0}
section{background:#fff;border:1px solid var(--line);border-radius:10px;padding:18px 22px;margin-bottom:18px}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:#eef2f8;white-space:nowrap}
tr:nth-child(even) td{background:#fbfcfe}
tr.active td{background:#f2fbf6}
code{font-family:Consolas,Menlo,monospace;background:#f1f4f9;padding:1px 5px;border-radius:4px;font-size:12px}
.num{font-family:Consolas,Menlo,monospace;white-space:nowrap}
.tag-yes{color:var(--ok);font-weight:600}
.tag-mirror{color:var(--warn)}
.notice{background:#fff8e8;border:1px solid #f3d79a;border-radius:8px;padding:11px 14px;margin:10px 0;color:#7c4a08}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.tile{border:1px solid var(--line);border-radius:8px;padding:11px 13px;background:#fbfcfe}
.tile b{display:block;color:var(--accent);margin-bottom:4px}
ul{margin:6px 0 6px 20px;padding:0}li{margin:3px 0}
nav a{color:var(--accent);text-decoration:none;margin-right:14px;font-size:13px}
nav a:hover{text-decoration:underline}
footer{color:var(--soft);font-size:12px;text-align:center;margin-top:26px}
@media print{body{background:#fff}section{box-shadow:none;break-inside:avoid}}
</style>
</head>
<body><div class="wrap">
<header>
<h1>MD520 虚拟变频器教学手册</h1>
<p>独立设备场景 <code>packages/md520-vfd</code> 的参数、功能、接线与现场接入说明。生成自源码单一来源，参数变动后重新运行 <code>generate-handbook.cjs</code> 即可同步。</p>
<p><strong>范围声明</strong>：本手册是<strong>教学子集</strong>，不是功能码全量表。08 用户手册明确「功能码、故障码的完整信息请参见 09 参数手册」，而 09 参数手册在本机多次抽取失败，因此未收录的码不猜默认值。所有物理算法（矢量控制算法、直流制动电流闭环、电机辨识）均为教学近似或不做。</p>
</header>
<nav><a href="#s1">1 快速上手</a><a href="#s2">2 面板与按键</a><a href="#s3">3 参数速查</a><a href="#s4">4 参数效果</a><a href="#s5">5 四种给定</a><a href="#s6">6 端子接线</a><a href="#s7">7 PLC 点位</a><a href="#s8">8 通信地址</a><a href="#s9">9 故障码</a><a href="#s10">10 现场接入</a><a href="#s11">11 排查</a><a href="#s12">12 DI/AI 端子控制</a></nav>

<section id="s1"><h2>1 快速上手</h2>
<div class="grid">
<div class="tile"><b>启动</b><code>npm run start:lab</code> 只起 Web :5201、PLC 网关 :8081、状态中继 :8082；8081 / 8082 绑回环，仿真模式连外部 PLC 仿真软件或实物 PLC。内置虚拟 PLC 不随教学交付启动。</div>
<div class="tile"><b>进入设备</b>主控本机 <code>http://127.0.0.1:5201/</code>，设备列表点「MD520 变频器」。观众用局域网 IP 访问，自动跟随、只读、零上行。</div>
<div class="tile"><b>两种模式</b>手动模式直接操作变频器面板；仿真模式出现 PLC 连接面板，连外部 PLC（Modbus TCP / S7 / 三菱），或用 DI/AI 端子接线控制。</div>
<div class="tile"><b>初始状态</b>默认停机 <code>outputHz=0</code>、命令源 <code>F0-02=0</code>（操作面板）、频率源 <code>F0-03=0</code>（数字设定）、预置频率 50Hz。</div>
</div>
<p class="notice">变频器是<strong>独立设备场景</strong>，与传送带分拣、自动配药完全解耦；改变频器链路不会碰到那两个已定稿场景。</p>
</section>

<section id="s2"><h2>2 面板与按键</h2>
<p>真机灰白双层外壳 + 独立显示窗（6 位辅显 + 5 位主显、9 个单位灯、4 个菜单灯），10 键布局：四瓣导航（上下左右）+ 中央 OK、左侧 PRG、右侧菜单键、左下 RUN、右下 STOP/RESET、底部 MF.K。按下有下沉 / 缩放 / 压暗与回弹动画。</p>
<h3>三级菜单与四种菜单</h3>
<ul><li>PRG 进一级参数组 → OK 进二级参数 → OK 进三级设定值；上下键改值、左右键选闪烁位、OK 保存、PRG 放弃。</li>
<li>菜单键点按切换 <code>basic / user / changed / fault</code> 四种菜单，长按 600ms 切主 / 辅显示区。</li>
<li><code>user</code> 菜单固定显示五种控制方式的常用设定；<code>basic</code> 菜单始终显示 ${params.length} 个参数。</li></ul>
<h3>MF.K 键（面板固定功能）</h3>
<p>MF.K 固定作正反转切换，仅在面板命令源 <code>F0-02=0</code> 下有效；端子 / 通信命令源下不抢方向。教学子集不再收录方向切换的档位参数。</p>
<p>方向切换的真值分两层：<code>direction</code> 是目标方向，指令下达立刻改控制字、状态字与 FWD/REV 丝印；<code>runDirection</code> 是实际输出方向，3D 电机 / 皮带用它。换向时先按 <code>F0-18</code> 把频率降到 0（仍按原方向转、只是变慢），归零后才翻转方向并按 <code>F0-17</code> 反向加速，不会瞬间反转。观众端通过 <code>VFD_DIRECTION</code> / <code>VFD_RUN_DIRECTION</code> 数值镜像跟随整个过程。</p>
<p><strong>换向时长由加减速参数决定</strong>：减速速率 = <code>F0-10</code> / <code>F0-18</code>，反向加速速率 = <code>F0-10</code> / <code>F0-17</code>；斜坡标尺固定取最大频率，换向减速时取运行目标频率避免卡住。手册 30.5.4（681 页）的 <code>F8-12 正反转死区时间</code> 默认 0.0s，与本教学子集「归零即换向」一致，未单独收录。</p>
</section>

<section id="s3"><h2>3 常用参数速查（${params.length} 个 / ${new Set(params.map((p) => p.group)).size} 组）</h2>
<p>「生效」= 改值会改变运行指令、频率来源、段速或通信显示；「仅显示」= 收录并可设定但不改变行为。教学子集只保留五种控制方式所需参数，默认档与手册出厂值一致。</p>
<table><tr><th>功能码</th><th>名称</th><th>默认</th><th>范围 / 单位</th><th>属性</th><th>效果</th></tr>
${paramRows}
</table>
<p class="notice">手册依据：306 页起 17.2.7/8/9/13（F0 命令源与频率源）、320 页 17.2.20（F4 DI 功能）、331 页 17.2.22（FC 多段）、339 页 18.3（通信地址），以及功能手册 1.1.1.3 四种端子命令方式。</p>
</section>

<section id="s4"><h2>4 设不同参数有什么不同效果</h2>
<table><tr><th>参数</th><th>改成不同值后</th></tr>
<tr><td>F0-08 / F0-17 / F0-18</td><td>面板给定的目标频率与加减速快慢（例：F0-17 从 20s 改 2s，爬升明显加快）</td></tr>
<tr><td>F0-10 / FC-00~07</td><td>频率上限与段速百分比基准（FC-02 从 40% 改 10% → 段 2 从 20Hz 变 5Hz）</td></tr>
<tr><td>F0-02</td><td>换命令源：0 面板 / 1 端子 / 2 通信</td></tr>
<tr><td>F4-00~F4-04</td><td>改各 DI 的功能：1 正转 / 2 反转 / 3 三线控制 / 12~15 多段端子 1~4，端子角色不再写死</td></tr>
<tr><td>F4-11</td><td>四种端子命令方式：两线式1 / 两线式2 / 三线式1 / 三线式2</td></tr>
<tr><td>F0-03</td><td>换频率源：0 数字 / 2 AI1 / 3 AI2 / 6 多段 / 9 通信</td></tr>
<tr><td>FD-00 / FD-01 / FD-02</td><td>485 波特率、数据格式与站号，状态行显示随设定变化</td></tr>
</table>
<p class="notice">教学子集只实现五种控制方式：面板、端子开关量、多段速、AI 模拟量、Modbus 通信。不做矢量算法、直流制动闭环与电机辨识；斜坡固定以 F0-10 为基准，停机按 F0-18 减速。输出电流 / 功率为固定系数监视量，50Hz 满速 9.00A / 3.70kW。</p>
</section>

<section id="s5"><h2>5 五种控制方式</h2>
<div class="grid">
<div class="tile"><b>面板控制</b>F0-02=0 / F0-03=0：RUN/STOP 控制，目标频率取 F0-08，按 F0-17/18 斜坡；MF.K 切换方向。</div>
<div class="tile"><b>端子开关量</b>F0-02=1：出厂 DI1 正转、DI2 反转，F4-11=0 两线式1；双断或双合均停机。改 F4-00~F4-04 可换端子角色，F4-11 可选两线式2 / 三线式1 / 三线式2。</div>
<div class="tile"><b>多段速</b>F0-02=1 / F0-03=6：把若干 DI 配成功能 12~15，组成段位选 FC-00~FC-07 百分比 × F0-10；运行命令仍需一个正转 / 反转端子给出。</div>
<div class="tile"><b>AI 模拟量</b>F0-03=2 / 3：AI1 -10~10V、AI2 0~10V 或 0~20mA（拨码切换），线性映射到 0~F0-10。</div>
<div class="tile"><b>Modbus 通信</b>F0-02=2 / F0-03=9：写 2000H 控制字、7310H 频率给定、1000H 百分比，读 3000H / 1001H / 1009H；FD-00~02 设波特率、格式与站号。</div>
</div>
<p class="notice">端子没有固定身份：DI 的角色完全由 F4-00~F4-04 当前值决定，面板按钮标题也随参数派生，避免"标签叫多段端子、出厂却是正转"的错位。</p>
</section>

<section id="s6"><h2>6 控制回路端子接线</h2>
${terminalSvg}
<h3>端子说明（用户手册表 4-5 / 4-6）</h3>
<table><tr><th>类别</th><th>端子</th><th>说明</th></tr>
<tr><td>电源</td><td>+10V / +24V / OP / COM / GND</td><td>+10V 最大 10mA（外接电位器 1~5kΩ）；+24V 最大 200mA；用外部信号驱动 DI 时 OP 需与外部电源连接并与 +24V 断开。</td></tr>
<tr><td>模拟输入</td><td>AI1 / AI2</td><td>AI1 -10V~+10V、输入阻抗 22kΩ；AI2 支持电压 / 电流 / 温度，经 S2/S3 拨码切换。</td></tr>
<tr><td>数字输入</td><td>DI1~DI5</td><td>光耦隔离、兼容双极性，工作电压 9~30V；DI5 还可作高速脉冲输入（最高 100kHz）。</td></tr>
<tr><td>模拟输出</td><td>AO1</td><td>0~10V 或 0~20mA，由 S4 拨码选择，默认电压输出。</td></tr>
<tr><td>数字输出</td><td>DO1 / FM / T/A-T/B-T/C</td><td>DO1 开路集电极 0~24V / 0~50mA；FM 可作高速脉冲输出；继电器触点 250VAC 3A / 30VDC 1A。CME 与 COM 出厂短接，用外部电源驱动 DO1 需断开。</td></tr>
<tr><td>通信</td><td>485+ / 485-</td><td>RS485 差分，终端电阻按现场总线长度配置。</td></tr>
<tr><td>安全</td><td>STO1 / STO2</td><td>安全扭矩关闭，任一通道断开即封锁输出，优先级高于一切 PLC / 面板逻辑（教学场景未实现硬联锁）。</td></tr>
</table>
</section>

<section id="s7"><h2>7 外部 PLC 三协议点位</h2>
<p>PLC 程序（AutoShop / 博途 / GX Works2 / 实物 PLC）通过网关直接打开变频器 DI、读回变频器 DO，并读写 485 数值字。<strong>实物 PLC 没有实际接线，统一使用 M 区</strong>：真实 PLC 的 X 会被 END 后的物理 I/O 刷新覆盖、Y 会被程序输出刷新覆盖，上位机写 X/Y 无效。</p>
<table>${ioTable}</table>
<p>Modbus TCP 是通用第四条路：任何支持 Modbus TCP 的 PLC 都可以用 coils <code>130~134 / 140~142</code> 加 15 个数值字直接读写虚拟变频器，不必走专有协议。</p>
<p>外部 PLC 程序按上表点位写 DI / 读 DO，并按第 8 章通信地址读写数值字；现场实物 PLC 的 IP 在连接面板填写，不固化在程序里。内置虚拟 PLC 仅开发 / 验收使用，不参与课堂链路。</p>
</section>

<section id="s8"><h2>8 18.3 Modbus 专用参数通信地址</h2>
<p>下表是<strong>接入网关读写链路的 ${words.length} 个 uint16 单字</strong>，三处同源（<code>CONNECT_WORDS</code> / <code>md520-addresses.ts</code> / <code>mock-addresses.js</code>）。</p>
<table><tr><th>变量名</th><th>十进制</th><th>十六进制</th><th>说明</th></tr>${wordRows}</table>
<h3>关键口径</h3>
<ul>
<li><strong>2000H 控制命令没有 0 档</strong>，写 0 无意义。取值 1~7（1 正转 / 2 反转 / 3 正转点动 / 4 反转点动 / 5 自由停机 / 6 按 F0-18 减速停机 / 7 故障复位）；0 档只存在于 7311H。</li>
<li>1000H 是相对最大频率的百分比（-10000~+10000 对应 ±100.00%）；7310H 是按 0.01Hz 写入的通信设定频率2，单位由 FD-09、小数点与 F0-22 一致。</li>
<li>3000H 状态：1 正转 / 2 反转 / 3 停机 / 4 电机参数辨识 / 5 故障；7044H 状态2 的 bit8~15 是故障主码。</li>
<li>1F01H 是<strong>通信专用</strong>参数初始化（1 恢复出厂 / 4 恢复备份 / 501 备份当前），与面板参数初始化是不同接口，不要互相覆盖。</li>
</ul>
<p><code>MD520_COMM</code> 另登记 18.3 表的 1002H~1007H 监视字、100BH/100CH AI2/AI3、2003H/2004H、1F00H/1F01H、8000H 等地址，只作查表口径，不接入网关单字变量表。</p>
</section>

<section id="s9"><h2>9 故障码与状态</h2>
<p class="notice">用户手册把故障码完整表指向 09 参数手册；本机 09 参数手册抽取失败，下列 ${faults.length} 条是教学子集，<strong>不是全量表</strong>。</p>
<table><tr><th>故障码</th><th>名称</th><th>处理</th></tr>${faultRows}</table>
<h3>8000H 变频器故障主码（18.3 表，用户手册 339~342 页）</h3>
<table><tr><th>主码</th><th>描述</th></tr>${mainRows}</table>
<p>面板故障灯亮时辅显示区显示故障代码；状态字 3000H=5 表示故障，7044H 的 bit8~15 携带故障主码。</p>
</section>

<section id="s10"><h2>10 现场接入手册</h2>
<h3>通用前提</h3>
<ul><li>装软件的主控是唯一连 PLC 的设备；观众只读，通过中继跟随快照，不建 PLC 通道。</li>
<li>通信恒同源：<code>/ws/plc</code> → 网关 :8081，<code>/ws/relay</code> → 中继 :8082；八个内部口全绑 <code>127.0.0.1</code>，对外只需放行 :5201。</li>
<li>网关出站白名单 <code>DT_PLC_HOSTS</code> 默认仅回环；接实体 PLC 必须显式放行，例如 <code>DT_PLC_HOSTS=192.168.1.50</code>。</li>
<li>每次启动重新签发内部链路 token；LAN 观众无法写 PLC 通道。</li></ul>
<div class="grid">
<div class="tile"><b>AutoShop / 汇川 H5U（Modbus TCP）</b>连接预设「汇川H5U (Modbus)」<code>127.0.0.1:502</code>。PLC 程序写 coils 130~134 驱动 DI、读 140~142 取 DO；数值字写 2000H / 7310H / 1000H，读 3000H / 1001H / 1009H 做联锁。</div>
<div class="tile"><b>博途 / S7-PLCSIM</b>预设「S7-1200/1500 仿真」<code>:102</code>，rack 0 / slot 1。布尔点 <code>M130.0~M134.0</code> / <code>M140.0~M142.0</code>，数值字 <code>MW1000~MW1014</code>。CPU 属性要启用 PUT/GET，否则 ISO 握手失败。</div>
<div class="tile"><b>GX Works2 / GX Simulator2</b>仿真档用 <code>Y0~Y4</code> / <code>X0~X2</code>，数值字 <code>D1000~D1014</code>；实物 FX3U/FX5U 无接线统一 <code>M130~M134</code> / <code>M140~M142</code>。链路走 MX Component 逻辑站号，<strong>填 IP 不生效</strong>。</div>
<div class="tile"><b>实物 PLC</b>在连接面板把「端口」理解为逻辑站号；站号必须与通信设置实用程序里已配置的编号一致。项目默认 0 只是历史值，不是通用值。FX3U（GX Works2）与 FX5U（GX Works3）各维护一套工程。</div>
</div>
</section>

<section id="s11"><h2>11 常见错误排查</h2>
<table><tr><th>现象</th><th>检查</th></tr>
<tr><td>Open failed / 逻辑站未配置</td><td>MX Component 通信设置实用程序里已配置的逻辑站编号；默认 0 不适用时改成实际编号。</td></tr>
<tr><td>ISO 握手失败</td><td>博途 CPU 属性 → Protection → 允许 PUT/GET；确认 rack / slot。</td></tr>
<tr><td>无法写入频率</td><td>F0-03=0 时地址对应 F0-08；F0-03=9 时地址应为 1000H 或 7310H；检查终端电阻。</td></tr>
<tr><td>写 2000H=0 没反应</td><td>该地址无 0 档，停机写 6（按 F0-18 减速）或 5（自由停机）。</td></tr>
<tr><td>面板 FWD/REV 切了但电机还在原方向转</td><td>这是正常的换向减速过程：先按 F0-18 降到 0 才翻转。想缩短等待把 F0-17 / F0-18 改小；同时确认 F0-02=0（面板命令源）。</td></tr>
<tr><td>改参数没效果</td><td>核对第 4 章「生效 / 仅显示」列；部分参数只记录数值，属教学子集边界。</td></tr>
<tr><td>观众端数值不跟随</td><td>中继只允许一个主控上报；第二个主控会被拒绝，关闭多余主控页面即可。</td></tr>
</table>
</section>

<section id="s12"><h2>12 外部 PLC 的 DI/AI 端子控制</h2>
<p>除了第 7、8 章的通信控制（F0-02=2、F0-03=9），现场更常见的是<strong>端子控制</strong>：PLC 的数字量输出接变频器 DI 端子决定运行、方向与多段速，模拟量输出接 AI 端子给频率。两种方式都由外部 PLC 编程软件的 simulator 或实物 PLC 提供，教学交付不启动任何内置虚拟 PLC。</p>
<table><tr><th>控制方式</th><th>参数设定</th><th>外部 PLC 侧</th></tr>
<tr><td>通信控制</td><td><code>F0-02=2</code>、<code>F0-03=9</code></td><td>Modbus TCP / S7 / 三菱写 2000H、7310H、1000H，读 3000H、1001H、1009H</td></tr>
<tr><td>端子运行</td><td><code>F0-02=1</code></td><td>数字量输出接 DI1 正转 / DI2 反转（出厂默认），角色由 F4-00~F4-04 决定，F4-11 选命令方式</td></tr>
<tr><td>模拟量给定</td><td><code>F0-03=2</code> 或 <code>3</code></td><td>模拟量输出接 AI1（-10~10V）或 AI2（0~10V / 0~20mA），100AH 数值镜像</td></tr>
<tr><td>多段速</td><td><code>F0-03=6</code></td><td>把 DI1~DI3 配成功能 12/13/14（或任意 DI 配成 12~15）后组合选段，FC-00~FC-07 是相对 F0-10 的百分比</td></tr></table>
<h3>接线与调试</h3>
<ul>
<li>端子接线见第 6 章控制回路图：DI1~DI5、AI1/AI2、AO1、DO1/FM、485+/485-、STO1。</li>
<li>切换 F0-02 / F0-03 前先停机，这两个参数属「停机更改」。</li>
<li>两线式1 下正转 / 反转两路同时有效或同时断开均为停机，属禁止态。</li>
<li>现场 IP 在连接面板按实际网络填写；接实体 PLC 需在 <code>DT_PLC_HOSTS</code> 显式放行。</li>
</ul>
<h3>开发 / 验收说明</h3>
<p class="notice">内置虚拟 PLC 靶机（<code>1503 / 1505 / 1507 / 1508</code>）只在 <code>npm run start:devlab</code> 下启用，供 security-check / plc-ports-check / plc-3d-link-check 等帧级回归脚本使用，不参与课堂交付，也不列入实验步骤。</p>
</section>

<footer>MD520 虚拟变频器教学手册 · 由 generate-handbook.cjs 从源码生成 · 教学子集，非全量表 · 配套 <a href="MD520实验指导书.html">MD520实验指导书.html</a>（实验指导书）</footer>
</div></body></html>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`OK ${OUT}`);
console.log(`params=${params.length} groups=${new Set(params.map((p) => p.group)).size} words=${words.length} faults=${faults.length}`);
console.log(`io-vars-source=${ioSrc.includes('MD520_MITSUBISHI_REAL_VARS') ? 'verified' : 'missing'}`);
