#!/usr/bin/env node
/**
 * 生成《MD520 虚拟变频器实验指导书》自包含 HTML（30 个实验）。
 * 参数默认值从 src/vfd/md520Spec.ts 读取，避免指导书与代码脱节。
 *
 * 用法：node packages/md520-vfd/docs/generate-lab-guide.cjs
 * 输出：packages/md520-vfd/docs/MD520实验指导书.html
 */
const fs = require('fs');
const path = require('path');

const PKG = path.resolve(__dirname, '..');
const spec = fs.readFileSync(path.join(PKG, 'src/vfd/md520Spec.ts'), 'utf8');
const OUT = path.join(__dirname, 'MD520实验指导书.html');

const FC = [0, 20, 40, 60, 80, 100, 70, 50];
const re = /\{\s*code:\s*'([^']+)',\s*group:\s*'[^']+',\s*index:\s*\d+,\s*name:\s*'[^']+',\s*defaultValue:\s*([^,]+)/g;
const D = {};
for (const m of spec.matchAll(re)) {
  const fc = m[2].trim().match(/^MD520_FC_DEFAULT_PERCENT\[(\d+)\]$/);
  D[m[1]] = fc ? FC[Number(fc[1])] : Number(m[2]);
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

/**
 * 新手入门对照：文档里的按键代号 → 面板键帽符号 → 悬停提示 → 作用。
 * 面板键帽只印符号（如 ↩），悬停提示带代号（如 "PRG ↩ · 编程/返回键"），
 * 这份表让「实验步骤里的 PRG」和「鼠标指到的那颗键」能对上号。
 */
const KEY_GUIDE = [
  { code: 'PRG', face: '↩', name: '编程/返回键', where: '键盘左侧竖长键', role: '进一级菜单；编辑时放弃修改并退回上一级' },
  { code: 'MENU', face: '⌂', name: '菜单键', where: '键盘右侧竖长键', role: '短按切 basic/user/changed/fault 四种菜单；长按 600ms 切主/辅显示区' },
  { code: 'OK', face: 'OK', name: '确认键', where: '导航环中央圆键', role: '逐级进入菜单、进入编辑态、保存设定值' },
  { code: 'UP', face: '△', name: '递增键', where: '导航环上瓣', role: '切参数组/参数；编辑时增大闪烁位数值' },
  { code: 'DOWN', face: '▽', name: '递减键', where: '导航环下瓣', role: '切参数组/参数；编辑时减小闪烁位数值' },
  { code: 'LEFT', face: '◀', name: '左移位键', where: '导航环左瓣', role: '编辑时把闪烁位左移一位' },
  { code: 'RIGHT', face: '▶', name: '右移位键', where: '导航环右瓣', role: '编辑时把闪烁位右移一位' },
  { code: 'RUN', face: '◇', name: '运行键', where: '键盘左下斜键', role: '面板命令源下启动变频器' },
  { code: 'STOP', face: '⊗', name: '停止键/故障复位', where: '键盘右下斜键', role: '停机；有故障时复位' },
  { code: 'MF.K', face: 'MF. K', name: '多功能选择键', where: '键盘底部胶囊键', role: '面板命令源下切换正反转目标方向' },
];

/** 两种运行模式说明：实验步骤里的「保持手动模式」指的是这里的选择 */
const MODE_GUIDE = [
  { mode: '手动', meaning: '不连 PLC，直接用面板按键操作变频器。设备列表进入后默认就是这一档，入门实验都在这里做。',
    how: '进入 MD520 场景后，左上面板「运行模式」选中「手动」即可，无需连接面板、无需 PLC。' },
  { mode: '仿真', meaning: '由外部 PLC 编程软件的 simulator 或实物 PLC 控制变频器，面板下方出现 DI/AI/485 教学信号区。',
    how: '在「运行模式」点「仿真」，再用连接面板连外部 PLC；教学交付不启动任何内置虚拟 PLC。' },
];

/** 三级菜单层级：L1 参数组 → L2 参数 → L3 设定值 */
const MENU_GUIDE = [
  { level: 'L1 参数组', reach: '待机主显下按 PRG', see: '辅显显示参数组字母，如 F0', move: 'UP/DOWN 切组，OK 进 L2，PRG 退回主显' },
  { level: 'L2 参数', reach: 'L1 下按 OK', see: '主显显示参数码，如 F0-08', move: 'UP/DOWN 选参数，OK 进 L3，PRG 退回 L1' },
  { level: 'L3 设定值', reach: 'L2 下按 OK', see: '主显显示数值并有某一位闪烁，如 50.00', move: 'LEFT/RIGHT 选闪烁位，UP/DOWN 改数值，OK 保存退到 L2，PRG 放弃修改' },
];

/** 每个实验：目的 / 步骤 / 预期现象（带具体数值）/ 观察窗口 / 易错点 */
const LABS = [
  // A 面板与菜单
  { g: 'A', n: 1, name: '三级菜单读写参数', mode: '手动',
    goal: '学会用面板找到并修改一个参数。三级菜单就是 L1 参数组 → L2 参数码 → L3 设定值三层，进一层按 OK、退一层按 PRG。',
    steps: ['设备列表点「MD520 变频器」进入，左上面板「运行模式」选中「手动」。手动＝不接 PLC，直接用面板按键操作；这是进入后的默认档，本实验不用连任何 PLC。',
      `面板左上那颗印着 ↩ 的键就是 PRG 键（鼠标悬停显示「PRG ↩ · 编程/返回键」）。按它进 L1，用 △ 递增键切到 F0 组，按中央 OK 进 L2，用 △ 选到 ${'`F0-08`'}，再按 OK 进 L3。`,
      `L3 主显是 ${D['F0-08']}.00 且有一位在闪：◀▶ 左右键选闪烁位，△▽ 上下键把预置频率改成 30.00Hz。`,
      '按 OK 保存（自动跳到下一个参数）；再改一次但按 PRG 放弃，对比保存和放弃两次的结果。'],
    expect: '保存后主显 30.00、状态行显示下一个参数码；按 PRG 放弃则回到修改前的值。参数标「停机更改」时运行中改不了。',
    watch: '主/辅显示区、闪烁位、状态行 L1/L2/L3',
    trap: '闪烁位用 ◀▶ 左右键、数值用 △▽ 上下键；右侧印 ⌂ 的 MENU 键是切四种菜单，不是返回键，别按它退出。' },
  { g: 'A', n: 2, name: '四种菜单与主辅显示区', mode: '手动',
    goal: '区分 basic / user / changed / fault 四种菜单，掌握菜单键点按与长按。',
    steps: ['点按菜单键循环四种菜单，观察 basic 与 user 的参数条数。', '先改几个参数，再切到 changed，确认只列出改过出厂值的参数。', '长按菜单键 600ms 切主/辅显示区；切到 fault 看故障列表。'],
    expect: `basic 显示全部 ${Object.keys(D).length} 个参数；user 固定显示五种控制的常用设定；changed 只列偏离默认值的码；fault 显示 6 条教学故障码。`,
    watch: '辅显示区代码、菜单指示灯', trap: '长按必须超过 600ms，短按只切菜单。' },
  { g: 'A', n: 3, name: '面板 RUN/STOP 与预置频率', mode: '手动',
    goal: '理解面板命令源与加减速斜坡，建立频率与 3D 转速的对应关系。',
    steps: [`确认 ${'`F0-02=0`'}（操作面板）、${'`F0-03=0`'}（数字设定）、${'`F0-08`'} = ${D['F0-08']}Hz、${'`F0-17`'} = ${D['F0-17']}s。`, '按 RUN，每 1 秒记录一次输出频率；到稳态后按 STOP。', `把 ${'`F0-17`'} 改成 2s，复位后重做一次。`],
    expect: `默认 20s 斜坡下 1 秒约升 2.5Hz、约 20 秒到 ${D['F0-08']}Hz；改成 2s 后 1 秒约升 25Hz。3D 风扇、双滚筒、皮带条纹与频率牌同步。`,
    watch: '主显输出频率、3D 风扇转速、皮带条纹位移', trap: '斜坡时间是从 0 到最大频率的时间，不是到目标频率的时间。' },
  { g: 'A', n: 4, name: '端子命令方式四档总览', mode: '手动',
    goal: '认识 F4-11 四种端子命令方式，理解端子角色由参数而非 DI 编号决定。',
    steps: ['保持 F0-02=0，先看面板出厂默认：DI1 功能 1 正转、DI2 功能 2 反转、F4-11=0 两线式1。', '把 F4-11 依次切到 0/1/2/3，每档到教学信号区看 DI 按钮标题是否随 F4-xx 派生。', '对照教学手册第 1.1.1.3 节四种方式的真值表。'],
    expect: '两线式1 双断/双合停机、单合正转或反转；两线式2 一端子运行一端子方向；三线式 需功能 3 端子常闭且启动取上升沿。面板按钮标题随功能码变化，不再是固定文案。',
    watch: 'F4-11 当前档位、DI 按钮 title、面板 FWD/REV 丝印', trap: 'F4-11 与 F4-00~F4-04 配合才决定行为；只改命令方式不改功能码可能得不到预期端子。' },
  { g: 'A', n: 5, name: '改端子功能：交换方向与多段端子', mode: '手动',
    goal: '掌握 F4-00~F4-04 决定 DI 角色，验证端子没有写死的身份。',
    steps: ['把 F4-00 从 1（正转）改成 2（反转）、F4-01 从 2 改成 1（正转），F0-02=1 端子命令源。', '只合 DI1，看方向；再改成只合 DI2，看方向。', '把 F4-00 改成 12（多段指令端子1），回面板看 DI1 标题变化。'],
    expect: '交换功能码后 DI1 驱动反转、DI2 驱动正转，证明方向不绑 DI 编号；改成 12 后 DI1 不再单独给运行命令，标题变成「多段指令端子1」。',
    watch: 'DI 按钮 title、FWD/REV 丝印、3D 转向', trap: '改端子功能前先停机；多段端子只给段位，运行命令要靠另一个配成正转/反转的端子。' },

  // B 给定与频率
  { g: 'B', n: 6, name: '四种给定切换', mode: '手动 + 仿真',
    goal: '分辨命令源 F0-02 与频率源 F0-03，理解谁能抢运行权。',
    steps: ['依次设 F0-02=0/1/2，观察面板 RUN 是否生效。', '固定 F0-02=0，依次设 F0-03=0/2/3/6/9，观察目标频率从哪来。'],
    expect: 'F0-02=2（通信）时面板 RUN/STOP 不再抢运行权，由 2000H 控制字决定；F0-03=6 走 DI 多段速、=9 走通信给定。',
    watch: '485 状态行 2000H 命令、运行/停机徽标', trap: '命令源与频率源是两个独立参数，不要一起改。' },
  { g: 'B', n: 7, name: 'DI 多段速 8 段', mode: '手动',
    goal: '掌握 DI1~DI3 三位二进制选段 + DI4 运行使能。',
    steps: ['设 F0-02=1、F0-03=6；教学信号区按 DI4 使能。', '按 DI1~DI3 组合出 000~111，逐段记录「段N xxHz」。'],
    expect: `默认 FC 百分比 ${FC.join('/')}% 对应 ${FC.map((v) => v / 100 * D['F0-10']).join('/')}Hz（F0-10=${D['F0-10']}Hz）。`,
    watch: '段速标签、面板输出频率、3D 转速', trap: 'DI4 不使能时不会运行；DI5 是高速脉冲输入，不参与选段。' },
  { g: 'B', n: 8, name: 'FC 段速成为真值', mode: '手动',
    goal: '验证段速不是硬编码 Hz 表，而是 FC 百分比 × F0-10。',
    steps: ['停在段 2（DI2 单独 ON），记下频率。', `把 ${'`FC-02`'} 从 ${FC[2]}% 改成 10%，保存后回到监控页。`, '再把 F0-10 从 50 改成 60，看同一段的变化。'],
    expect: `FC-02=40% → 20Hz；改成 10% → 5Hz；F0-10=60 后 10% → 6Hz。面板、PLC 参考程序、3D 读数同源。`,
    watch: '段速标签、1008H DI 位字、3D', trap: 'FC 单位是相对最大频率的百分比，不是 Hz。' },
  { g: 'B', n: 9, name: 'AI 模拟量给定', mode: '手动',
    goal: '理解 AI1 双极性电压、AI2 电压/电流拨码与频率映射。',
    steps: ['设 F0-03=2，拖 AI1 从 0 到 5.0V，记录输出频率；再拖到 -5.0V。', '设 F0-03=3，用「0~10V / 0~20mA」按钮切档，拖 AI2 到 5.0V 或 10mA。'],
    expect: `目标频率 = |AI| / 满量程 × F0-10：AI1 5.0V → 25Hz（取绝对值）；AI2 5.0V / 10mA → 25Hz。100AH 数值镜像同步。`,
    watch: 'AI1/AI2 滑块读数、100AH', trap: 'AI1 是 -10~10V 双极性，负电压给的是频率绝对值；方向另由 FWD/REV 决定。' },
  { g: 'B', n: 10, name: '外部 PLC 通信给定与状态回读', mode: '仿真',
    goal: '用外部 PLC 的控制字与频率给定控制变频器，并读懂回读状态。',
    steps: ['设 F0-02=2（通信命令源）、F0-03=9（通信频率源），在连接面板连外部 PLC 仿真软件或实物 PLC（Modbus TCP :502 / S7 :102 / 三菱）。', 'PLC 程序写 2000H=1（正转）、7310H=3000（30.00Hz）、1000H=6000（60.00%）。', '读 3000H、1001H、1009H、7044H，对照面板主显与 3D 转速。'],
    expect: '输出 30.00Hz；3000H=1（正转）、1001H=3000（0.01Hz）、1009H 的 DO1 位为 1；停机写 2000H=6 后 3000H=3。',
    watch: '面板 485 只读状态行、连接面板提示、PLC 在线表', trap: '2000H 没有 0 档，写 0 无意义；7310H 是 0.01Hz，1000H 是 ±100.00% 百分比。' },
  { g: 'B', n: 11, name: '固定斜坡与频率上限', mode: '手动',
    goal: '用 F0-17/F0-18 设定加减速时间，理解 F0-10 是输出频率上限。',
    steps: ['默认 F0-17=20s、F0-18=20s、F0-10=50，RUN 后记录 1 秒爬升量。', '把 F0-17 改成 10s，停机后重新 RUN 再记录 1 秒爬升量。', '把 F0-10 从 50 改成 30，观察主显上限。'],
    expect: '默认 1 秒爬升 2.5Hz；F0-17=10s 后 1 秒爬升 5Hz；F0-10=30 时主显不超过 30Hz。斜坡只由 F0-17/F0-18 决定，没有基准档位切换。',
    watch: '主显输出频率、3D 转速', trap: 'F0-17/F0-18 是固定斜坡时间，不再按基准档换算；F0-10 是上限，不是给定值。' },
  { g: 'B', n: 12, name: '五种控制方式总览', mode: '手动',
    goal: '用 F0-02 / F0-03 组合切换面板、端子、多段速、模拟量与通信控制。',
    steps: ['F0-02=0、F0-03=0 走面板：按键启停，MF.K 切方向。', 'F0-02=1 走端子：由 F4-11 与 F4-00~F4-04 决定运行命令；F0-03=6 时由功能 12~15 选 FC 段。', 'F0-03=2/3 走 AI1/AI2 模拟量给定；F0-02=2、F0-03=9 走 Modbus TCP 通信给定。'],
    expect: '面板档由按键决定方向与频率；端子档由 F4-11 与端子功能码决定；多段速由功能 12~15 选段；模拟量取 |AI| / 满量程 × F0-10；通信档由 2000H/7310H 决定。段 2（40%）在 F0-10=60 时为 24Hz。',
    watch: 'F0-02 / F0-03 当前值、面板 RUN/FWD/REV、主显与 3D', trap: 'F0-02 / F0-03 属停机更改参数，运行中切换会被拒绝或延后生效；教学子集没有矢量控制档位。' },

  // C 停机方向与状态
  { g: 'C', n: 13, name: '减速停机与固定斜坡标尺', mode: '手动',
    goal: '理解教学子集的停机行为：按 F0-18 减速，标尺固定取 F0-10。',
    steps: ['RUN 到 50Hz 后按 STOP，每 0.5 秒记录一次频率。', '把 F0-18 从 20s 改成 2s 重做一次。', '把 F0-10 从 50 改成 60，观察斜坡速率变化。'],
    expect: '默认 20s 减速下 0.5 秒约剩 48.75Hz；改成 2s 后约剩 43.75Hz；F0-10 加大后同样减速率更快。没有自由停机与直流制动段。',
    watch: '主显输出频率、3D 是否逐渐停转', trap: '斜坡标尺是 F0-10 最大频率，不是目标频率；教学子集不实现 F6 停机方式与直流制动。' },
  { g: 'C', n: 14, name: '两线式1 的禁止态与方向', mode: '手动 + 仿真',
    goal: '验证双断/双合停机与单端子正反转，符合手册真值表。',
    steps: ['F0-02=1、F4-11=0，DI1 正转、DI2 反转。', '依次试：全断、只合 DI1、只合 DI2、双合，记录运行状态与方向。'],
    expect: '全断与双合都停机；只合 DI1 正转；只合 DI2 反转。双合属禁止态，不允许当成反转指令。',
    watch: 'FWD/REV 丝印、1008H DI 位字、3D 转向', trap: '与电机正反转场景的互锁同类：两路同时有效优先保持安全态。' },
  { g: 'C', n: 15, name: '三线式启动上升沿', mode: '手动 + 仿真',
    goal: '理解三线式需要常闭允许端子，且启动信号取上升沿。',
    steps: ['设 F4-11=2、F4-02=3 三线控制，DI1 仍是正转、DI2 反转。', '只合 DI1（允许端子未合），观察。', '先合 DI3 允许，再合 DI1，记录；保持 DI3 与 DI1 闭合，连续采样。'],
    expect: '允许端子未合时一律停机；允许闭合后 DI1 上升沿才启动正转；持续闭合不重复触发，命令保持。',
    watch: '__dtVfdDrive 或直接看主显与 DI 位字', trap: '三线式是脉冲触发，不是电平保持；松开允许端子立即停机。' },
  { g: 'C', n: 16, name: 'MF.K 固定方向与 3D 换向过程', mode: '手动',
    goal: '掌握 MF.K 固定作面板命令源下的方向切换，观察先减速再反向加速。',
    steps: ['F0-02=0，RUN 到有输出，把 F0-17 / F0-18 改小到 2s。', '按 MF.K，立刻看 __dtVfdDrive：targetDirection 变 -1、direction 仍是 1、reversing=true。', '采样直到 hz 归零、direction 翻转，再间隔 0.5 秒采两次 fanAngle / beltPhase。'],
    expect: '换向期间仍按原方向减速；归零后才翻转并反向加速；风扇角差由负变正（实测 -0.83 → +1.21），皮带相位由正变负（+0.023 → -0.034）。',
    watch: '__dtVfdDrive.direction / targetDirection / reversing / hz / fanAngle / beltPhase', trap: '面板丝印显示目标方向，3D 用实际输出方向 runDirection；别在减速阶段就断言反向。' },
  { g: 'C', n: 17, name: '正反转切换：减速到零再反向加速', mode: '手动',
    goal: '验证换向不是瞬间反转，而是先按 F0-18 减速到 0、翻转输出方向、再按 F0-17 反向加速。',
    steps: ['F0-02=0，RUN 到有输出（建议先把 F0-18 / F0-17 改小到 2s 缩短等待）。', '按 MF.K，立刻看 __dtVfdDrive：targetDirection 变 -1、direction 仍是 1、reversing=true、hz 持续下降。', '连续采样直到 hz 归零、direction 翻成 -1，再看 hz 反向上升；随后间隔 0.5 秒采两次 fanAngle / beltPhase。'],
    expect: '换向期间电机仍按原方向转、只是越来越慢（减速阶段风扇角差仍为负）；频率归零后 direction 才由 1 变 -1 并反向加速；风扇角差由负变正（实测 -0.83 → +1.21），皮带相位由正变负（+0.023 → -0.034）；FWD/REV 丝印指令下达即互换。',
    watch: '__dtVfdDrive.direction / targetDirection / reversing / hz / fanAngle / beltPhase、FWD/REV 灯', trap: '别在减速阶段就断言反向：那时 direction 还是 1；面板丝印显示的是目标方向，3D 用的是实际输出方向 runDirection。' },
  { g: 'C', n: 18, name: 'DO 状态、故障与只读监视量', mode: '手动 + 仿真',
    goal: '读懂 DO1/FM/RELAY、3000H 状态与输出电流/功率监视量。',
    steps: ['RUN 到稳态，看 DO1（运行中）、FM（频率到达）亮，RELAY 灭。', '制造故障后看 RELAY 与 3000H=5，再用 STOP/RESET 或 2000H=7 复位。', '观察满载监视量；改变负载率（调目标频率），看电流/功率随频率线性变化。'],
    expect: '满载显示约 9.00A / 3.70kW；半速约 6.15A / 1.85kW；停机后监视量归零。',
    watch: 'DO 只读徽标、data-dt-vfd-monitor、3000H / 7044H', trap: '这些监视量是固定系数近似（空载 15% 电流 + 负载率线性），不依赖 F1 铭牌参数，不是真实电机模型。' },

  // D 外部 PLC 三协议
  { g: 'D', n: 19, name: 'AutoShop / Modbus TCP 读写', mode: '仿真',
    goal: '用外部 PLC 程序通过 coils 与 15 个数值字控制变频器。',
    steps: ['连接预设选「PLC 仿真软件 (Modbus TCP :502)」或「汇川 H5U」，现场实物 PLC 请在连接面板填实际 IP。', 'PLC 程序写 coils 130~134（DI1~DI5），读 140~142。', '写 2000H / 7310H / 1000H，读 3000H / 1001H / 1009H。'],
    expect: '写入 DI 位组合后 1008H 位字同步（例 130/132/133 置位 → 0b01101=13）；变频器 DO 三路回写到 140~142。',
    watch: '网关连接提示、1008H / 1009H、PLC 在线表', trap: 'coils 130~134 是 PLC → 变频器的输入，140~142 是回读输出；方向不要写反。' },
  { g: 'D', n: 20, name: '博途 / S7-PLCSIM 读写', mode: '仿真',
    goal: '掌握 S7 M 区位与 MW 字通道的对应关系。',
    steps: ['连接预设选「S7-1200/1500 仿真」:102，rack 0 / slot 1。', 'PLC 程序写 M130.0~M134.0、读 M140.0~M142.0；数值字用 MW1000~MW1014。'],
    expect: '点位表通过网关校验；本机无 PLCSIM 时连接层报「ISO 握手失败」，属预期，不是地址表错误。',
    watch: '网关连接提示、地址浮框 S7 列', trap: '博途 CPU 属性要启用 PUT/GET；M 区字与位不要混用。' },
  { g: 'D', n: 21, name: 'GX Works2 / GX Simulator2 读写', mode: '仿真',
    goal: '掌握三菱仿真档 Y/X 与 D 字通道。',
    steps: ['连接预设选「三菱 GX Simulator2 仿真」，逻辑站号填通信设置实用程序里已配置的编号。', 'PLC 程序写 Y0~Y4、读 X0~X2；数值字 D1000~D1014。'],
    expect: '仿真器无物理刷新，Y/X 可写；本机未配置逻辑站时连接层报 Open failed，属预期。',
    watch: '连接提示「逻辑站 N」、地址浮框三菱列', trap: 'MX Component 链路里填 IP 不生效；逻辑站号必须与实用程序一致，默认 0 不是通用值。' },
  { g: 'D', n: 22, name: '实物档统一 M 区', mode: '仿真',
    goal: '理解为什么实物 PLC 无实际接线时必须用 M 区。',
    steps: ['连接预设选三菱，把「连接目标」切到「实体 FX3U / FX5U · M 区」。', '对照地址浮框，确认输入/输出列都变成 M100~/M130~ 风格，本设备用 M130~M134 / M140~M142。'],
    expect: '同一段速程序在实物档下点位自动换成 M 区；FX3U（GX Works2）与 FX5U（GX Works3）各需一套工程。',
    watch: '连接目标下拉、地址对照表', trap: '真实 PLC 的 X 会被 END 后物理 I/O 刷新覆盖、Y 被程序输出刷新覆盖，上位机写 X/Y 无效。' },
  { g: 'D', n: 23, name: '三协议对照与通信 / 端子切换', mode: '仿真',
    goal: '同一控制逻辑换三种外部 PLC，并切换通信给定与 DI/AI 端子给定。',
    steps: ['用同一段速逻辑分别跑 Modbus TCP / S7 / 三菱，记录各自点位。', '把 F0-02 从 2（通信）改到 1（端子）、F0-03 从 9 改到 2（AI1），观察给定来源切换。'],
    expect: '三种协议下变频器行为一致；切到端子给定后通信控制字不再抢运行权，频率由 AI1 电压决定。',
    watch: '三协议地址表、F0-02 / F0-03 当前值、主显输出频率', trap: '切换给定源前先停机；运行中改 F0-02 / F0-03 属停机更改参数。' },

  // E 外部 PLC 的 DI/AI 端子控制
  { g: 'E', n: 24, name: '端子运行指令 DI1 / DI2', mode: '仿真',
    goal: '掌握 F0-02=1 时由外部 PLC 数字量输出决定运行与方向。',
    steps: ['设 F0-02=1（端子运行指令），连接外部 PLC 仿真软件或实物 PLC。', 'PLC 数字量输出接 DI1（正转）与 DI2（反转），依次置位观察。', '对照 1008H DI 位字与面板 RUN / FWD / REV。'],
    expect: 'DI1=1 且 DI2=0 时正转加速；DI2=1 且 DI1=0 时反转；双断或双合停机。功能码可改，端子角色不固定。',
    watch: '1008H DI 位字、FWD/REV 丝印、3D 风扇转速', trap: '两路方向信号同时得电属禁止态，不要当成反转指令。' },
  { g: 'E', n: 25, name: 'AI1 / AI2 模拟量频率给定', mode: '仿真',
    goal: '用外部 PLC 模拟量输出接 AI 端子给频率。',
    steps: ['设 F0-03=2（AI1）或 3（AI2），F0-02 保持 1 让端子决定运行。', 'PLC 模拟量输出给 0~10V / 0~20mA，或在教学面板拖 AI1 / AI2 滑块模拟现场信号。', '记录 5.0V / 10mA 对应的输出频率并对照 100AH 数值镜像。'],
    expect: '目标频率 = |AI| / 满量程 × F0-10：AI1 5.0V → 25Hz（取绝对值）；AI2 5.0V / 10mA → 25Hz；100AH 同步。',
    watch: 'AI1/AI2 读数、100AH、主显输出频率', trap: 'AI1 是 -10~10V 双极性，负电压给频率绝对值；方向由 FWD/REV 端子决定。' },
  { g: 'E', n: 26, name: 'DI 多段速与 FC 百分比', mode: '仿真',
    goal: '用 DI1~DI3 组合选择段速，理解 FC-00~FC-07 是相对最大频率的百分比。',
    steps: ['设 F0-03=6，把 DI1~DI3 的 F4-00~F4-02 改成 12/13/14，另留 DI4=1 正转给运行；PLC 组合 DI1~DI3 选段 0~7。', '把 FC-02 从 40% 改成 10%，再改 F0-10 从 50 到 60，观察同一段频率变化。'],
    expect: '默认 FC-02=40% → 20Hz；改成 10% → 5Hz；F0-10=60 后 10% → 6Hz。面板、PLC 程序、3D 读数同源。',
    watch: '段速标签、1008H DI 位字、3D', trap: 'FC 单位是相对最大频率的百分比，不是 Hz。' },
  { g: 'E', n: 27, name: '通信给定与端子给定对照', mode: '仿真',
    goal: '分清 F0-02 / F0-03 的给定来源，避免两个控制源抢运行权。',
    steps: ['先设 F0-02=2、F0-03=9 用 Modbus TCP 通信给定跑一次。', '再设 F0-02=1、F0-03=2 用默认 DI1 正转 + AI1 端子给定跑一次，对比运行权与频率来源。', '每次切换前先停机，切换后读 3000H / 1001H / 1009H 与面板主显。'],
    expect: '通信档由 2000H/7310H 决定运行与频率；端子档由 DI1 正转 / AI1 决定，通信控制字不再抢运行权；两档的 DO 回读一致。',
    watch: 'F0-02 / F0-03 当前值、3000H / 1001H、面板主显', trap: 'F0-02 / F0-03 属停机更改参数；运行中切换会被拒绝或延后生效。' },

  // F 平台与安全
  { g: 'F', n: 28, name: '主控—观众只读跟随', mode: '平台',
    goal: '验证 LAN 观众自动跟随、只读、零上行。',
    steps: ['装软件的机器开 http://127.0.0.1:5201/ 作为主控，进 MD520 场景。', '另一台设备用界面底部显示的局域网 IP 访问，不做任何点击。', '主控改参数/按 RUN，观察观众端数值与 3D。'],
    expect: '观众端无角色页、无房间码；键盘/DI/AI 全部 disabled；数值随主控快照更新；观众不建 PLC 通道。',
    watch: '观众端面板、:5201 界面底部 IP、中继快照', trap: '同一时刻只允许一个主控上报；第二个主控会被拒，关闭多余主控页面即可。' },
  { g: 'F', n: 29, name: '拓扑与 P0 安全认知', mode: '平台',
    goal: '理解教学交付拓扑、回环绑定与出站白名单。',
    steps: ['看 start:lab 启动日志，确认只有 Web :5201、PLC 网关 :8081、状态中继 :8082 三个服务。', '确认只有 :5201 对外，8081 / 8082 绑 127.0.0.1，仿真模式连外部 PLC 仿真软件或实物 PLC。', '查 DT_PLC_HOSTS 默认值与每次重签的内部 token。'],
    expect: '教学交付不启动任何内置虚拟 PLC；内置靶机仅在 npm run start:devlab 开发模式下启用，供帧级验收脚本复跑。接实体 PLC 需在 DT_PLC_HOSTS 显式放行。',
    watch: '启动日志、lab-info.json、security-check 运行态自检', trap: '不要为图方便把内部口改成 0.0.0.0；端口漂移会触发 assertInternalPorts 拒绝启动。' },
  { g: 'F', n: 30, name: '教学近似边界识别', mode: '综合',
    goal: '分清哪些参数改了真有效果、哪些只存值，避免把教学模型当真机。',
    steps: ['打开教学手册第 3/4 章，对照「生效 / 仅显示」列。', `挑 F0-17、FC-02、F4-00、F4-11、F0-03、FD-01 各改一次，记录有无现象。`, '总结哪些参数真正改变运行、哪些只影响显示，理解教学子集的五种控制边界。'],
    expect: 'F0-17 / FC-02 / F4-00 / F4-11 / F0-03 都有现象；FD-01 只改状态行显示；没有矢量算法、直流制动与电机辨识。',
    watch: '教学手册参数表、面板与 3D', trap: '09 参数手册抽取失败，未收录的码不猜默认值；参数/故障码都是教学子集。' },
];

const GROUPS = {
  A: '面板与菜单', B: '给定与频率', C: '停机方向与状态',
  D: '外部 PLC 三协议', E: 'DI/AI 端子控制', F: '平台与安全',
};
const GROUP_COLOR = { A: '#185FA5', B: '#0F6E56', C: '#BA7517', D: '#534AB7', E: '#993C1D', F: '#5F5E5A' };

const quickRows = LABS.map((l) => `<tr><td class="num">${l.n}</td><td><a href="#lab${l.n}">${esc(l.name)}</a></td><td>${GROUPS[l.g]}</td><td>${esc(l.mode)}</td></tr>`).join('\n');

/** 入门对照表：文档代号 ↔ 键帽符号 ↔ 位置 ↔ 作用，三份产物同源 */
const keyRows = KEY_GUIDE.map((k) => `<tr><td><code>${esc(k.code)}</code></td><td style="text-align:center;font-size:15px">${esc(k.face)}</td><td>${esc(k.name)}</td><td>${esc(k.where)}</td><td>${esc(k.role)}</td></tr>`).join('\n');
const modeRows = MODE_GUIDE.map((m) => `<tr><td><b>${esc(m.mode)}</b></td><td>${esc(m.meaning)}</td><td>${esc(m.how)}</td></tr>`).join('\n');
const menuRows = MENU_GUIDE.map((m) => `<tr><td><b>${esc(m.level)}</b></td><td>${esc(m.reach)}</td><td>${esc(m.see)}</td><td>${esc(m.move)}</td></tr>`).join('\n');

const sections = Object.keys(GROUPS).map((g) => {
  const cards = LABS.filter((l) => l.g === g).map((l) => `<article id="lab${l.n}" style="background:#fff;border:1px solid var(--line);border-left:4px solid ${GROUP_COLOR[g]};border-radius:10px;padding:16px 20px;margin-bottom:14px">
<h3 style="margin:0 0 10px;font-size:15px;color:var(--ink)">实验 ${l.n}　${esc(l.name)} <span style="font-size:12px;font-weight:400;color:var(--soft)">｜ ${esc(l.mode)} 模式</span></h3>
<p style="margin:6px 0"><b>目的</b>　${esc(l.goal)}</p>
<p style="margin:6px 0 4px"><b>步骤</b></p><ol style="margin:4px 0 8px 20px;padding:0">${l.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
<p style="margin:6px 0"><b>预期现象</b>　${esc(l.expect)}</p>
<p style="margin:6px 0"><b>观察窗口</b>　${esc(l.watch)}</p>
<p style="margin:6px 0;color:var(--warn)"><b>易错点</b>　${esc(l.trap)}</p>
</article>`).join('\n');
  return `<section id="grp${g}"><h2 style="color:${GROUP_COLOR[g]}">${g} 类　${GROUPS[g]}（${LABS.filter((l) => l.g === g).length} 项）</h2>${cards}</section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MD520 虚拟变频器实验指导书</title>
<style>
:root{--ink:#1f2937;--soft:#5b6675;--line:#dfe5ec;--accent:#1d4ed8;--warn:#b45309;--bg:#f7f9fc}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:28px 24px 70px}
header{border-bottom:3px solid var(--accent);padding-bottom:18px;margin-bottom:22px}
h1{font-size:27px;margin:0 0 8px}
h2{font-size:19px;margin:26px 0 14px;padding-left:11px;border-left:4px solid var(--accent)}
p{margin:8px 0}
section{background:transparent}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin:10px 0;background:#fff}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left}
th{background:#eef2f8}
.num{font-family:Consolas,Menlo,monospace}
code{font-family:Consolas,Menlo,monospace;background:#f1f4f9;padding:1px 5px;border-radius:4px;font-size:12px}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
b{font-weight:600}
.notice{background:#fff8e8;border:1px solid #f3d79a;border-radius:8px;padding:11px 14px;margin:10px 0;color:#7c4a08}
nav a{margin-right:12px;font-size:13px}
footer{color:var(--soft);font-size:12px;text-align:center;margin-top:26px}
@media print{body{background:#fff}article{break-inside:avoid}}
</style>
</head>
<body><div class="wrap">
<header>
<h1>MD520 虚拟变频器实验指导书</h1>
<p>共 <b>${LABS.length}</b> 个实验，分 6 类。每个实验给出目的、操作步骤、预期现象（带具体数值）、观察窗口与易错点。参数默认值由 <code>generate-lab-guide.cjs</code> 从 <code>md520Spec.ts</code> 读取，参数变动后重跑脚本即同步。</p>
<p class="notice"><b>教学边界</b>：变频器是教学子集，不是真机。矢量控制、直流制动电流闭环、电机辨识均不做；24 个教学参数围绕五种控制方式，改值即有对应现象或显示变化。仿真模式一律连接外部 PLC 编程软件的 simulator 或实物 PLC：用 Modbus TCP 通信控制（F0-02=2 / F0-03=9），或用 DI/AI 端子接线控制（F0-02=1）。内置虚拟 PLC 不是教学交付内容，只在开发 / 验收模式下启用。</p>
</header>
<nav><a href="#start">开始之前</a>${Object.keys(GROUPS).map((g) => `<a href="#grp${g}">${g} ${GROUPS[g]}</a>`).join('')}</nav>
<section id="start">
<h2>开始之前：先认清面板和模式</h2>
<p>实验步骤里写的 <code>PRG</code> / <code>OK</code> 是按键代号，面板键帽上印的却是符号（比如 <code>PRG</code> 键印的是 ↩）。把鼠标移到按键上，悬停提示会同时显示代号、符号和中文名，例如「PRG ↩ · 编程/返回键」。下面三张表先看一遍，后面 30 个实验就能对上号。</p>
<h3>1　两种运行模式：实验里的「手动 / 仿真」是什么意思</h3>
<table><tr><th>模式</th><th>是什么</th><th>怎么进入</th></tr>${modeRows}</table>
<h3>2　面板 10 键对照：代号 ↔ 键帽 ↔ 位置</h3>
<table><tr><th>代号</th><th>键帽符号</th><th>中文名</th><th>面板位置</th><th>作用</th></tr>${keyRows}</table>
<h3>3　三级菜单是什么：L1 组 → L2 参数 → L3 设定值</h3>
<p>「三级菜单读写参数」不是在三级子菜单里翻来翻去，而是改一个参数的三个步骤：先选参数所在的组（L1），再选具体参数码（L2），最后改这个参数的数值（L3）。每层按 <code>OK</code> 进一层、按 <code>PRG</code> 退一层。</p>
<table><tr><th>层级</th><th>怎么进</th><th>屏幕上看什么</th><th>能做什么</th></tr>${menuRows}</table>
</section>
<h2>实验速查表</h2>
<table><tr><th>编号</th><th>实验名称</th><th>类别</th><th>所需模式</th></tr>${quickRows}</table>
${sections}
<h2>通用观察窗口</h2>
<table><tr><th>窗口</th><th>看什么</th></tr>
<tr><td>面板</td><td>主/辅显示、FWD/REV 丝印、DO 只读徽标、485 状态行、输出电流/功率</td></tr>
<tr><td>3D 装置</td><td>风扇与双滚筒角速度、皮带条纹位移、LED 状态灯、频率数字牌；<code>?debug=1</code> 下 <code>__dtVfdDrive</code> 有 direction / fanAngle / beltPhase</td></tr>
<tr><td>状态口</td><td>外部 PLC 在线表、连接面板的「已连接」提示、网关读写结果；教学交付不提供内置虚拟 PLC 状态口</td></tr>
<tr><td>帧级探针</td><td>485 帧级、布尔链路、主探针 / 三接口专项 / 方向专项 CDP 验收脚本</td></tr></table>
<h2>建议课时顺序</h2>
<p>入门：实验 1~5（面板与菜单）→ 6~12（给定与频率，含外部 PLC 通信给定）；进阶：13~18（停机、方向、状态）；综合：19~23（外部 PLC 三协议）→ 24~27（DI/AI 端子控制）→ 28~30（平台与边界）。配套参考《MD520教学手册.html》。</p>
<footer>MD520 虚拟变频器实验指导书 · 由 generate-lab-guide.cjs 从源码生成 · ${LABS.length} 个实验</footer>
</div></body></html>
`;

fs.writeFileSync(OUT, html, 'utf8');

/**
 * 同一份实验数据再输出两份，保证「手册 / 场景内抽屉 / 打印版」三处同源：
 *  1) src/constants/labGuide.generated.ts —— 供场景内 React 抽屉直接 import；
 *  2) packages/platform/public/docs/*.html —— Vite preview 同源可访问，供打印 / 新标签查阅。
 */
const tsPath = path.join(PKG, 'src/constants/labGuide.generated.ts');
const generatedTs = `/* 由 docs/generate-lab-guide.cjs 自动生成，请勿手改；重跑脚本即同步 */
export interface LabEntry {
  g: string;
  n: number;
  name: string;
  mode: string;
  goal: string;
  steps: string[];
  expect: string;
  watch: string;
  trap: string;
}
export const LAB_GROUP_ORDER: string[] = ${JSON.stringify(Object.keys(GROUPS))};
export const LAB_GROUPS: Record<string, string> = ${JSON.stringify(GROUPS, null, 2)};
export const LAB_GROUP_COLOR: Record<string, string> = ${JSON.stringify(GROUP_COLOR, null, 2)};
export const LAB_DEFAULTS: Record<string, number> = ${JSON.stringify(D, null, 2)};
export const LABS: LabEntry[] = ${JSON.stringify(LABS, null, 2)};
export interface KeyGuideEntry { code: string; face: string; name: string; where: string; role: string }
export interface ModeGuideEntry { mode: string; meaning: string; how: string }
export interface MenuGuideEntry { level: string; reach: string; see: string; move: string }
export const KEY_GUIDE: KeyGuideEntry[] = ${JSON.stringify(KEY_GUIDE, null, 2)};
export const MODE_GUIDE: ModeGuideEntry[] = ${JSON.stringify(MODE_GUIDE, null, 2)};
export const MENU_GUIDE: MenuGuideEntry[] = ${JSON.stringify(MENU_GUIDE, null, 2)};
`;
fs.writeFileSync(tsPath, generatedTs, 'utf8');

const webDir = path.resolve(__dirname, '../../platform/public/docs');
fs.mkdirSync(webDir, { recursive: true });
const webPath = path.join(webDir, 'MD520实验指导书.html');
fs.writeFileSync(webPath, html, 'utf8');

console.log(`OK ${OUT}`);
console.log(`OK ${tsPath}`);
console.log(`OK ${webPath}`);
console.log(`labs=${LABS.length} groups=${Object.keys(GROUPS).length} defaults F0-08=${D['F0-08']} F0-17=${D['F0-17']} F4-01=${D['F4-01']}`);
