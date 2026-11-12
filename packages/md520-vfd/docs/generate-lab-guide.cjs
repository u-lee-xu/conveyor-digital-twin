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

/** 每个实验：目的 / 步骤 / 预期现象（带具体数值）/ 观察窗口 / 易错点 */
const LABS = [
  // A 面板与菜单
  { g: 'A', n: 1, name: '三级菜单读写参数', mode: '手动',
    goal: '掌握真机式 L1 参数组 → L2 参数 → L3 设定值的编辑、保存与放弃。',
    steps: ['设备列表进入「MD520 变频器」，保持手动模式。', `按 PRG 进一级菜单，用递增键切到 F0 组，OK 进二级，选 ${'`F0-08`'} 后 OK 进三级。`, `左右键选闪烁位，上下键把预置频率从 ${D['F0-08']}Hz 改成 30Hz。`, 'OK 保存（自动跳到下一个参数）；再改一次后用 PRG 放弃，对比两次结果。'],
    expect: '保存后主显 30.00、状态行显示下一个参数码；PRG 放弃则回到修改前的值。参数标「停机更改」时运行中改不了。',
    watch: '主/辅显示区、闪烁位、状态行 L1/L2/L3', trap: '闪烁位用左右键，数值用上下键；不要按菜单键退出（那是切菜单）。' },
  { g: 'A', n: 2, name: '四种菜单与主辅显示区', mode: '手动',
    goal: '区分 basic / user / changed / fault 四种菜单，掌握菜单键点按与长按。',
    steps: ['点按菜单键循环四种菜单，观察 basic 与 user 的参数条数。', '先改几个参数，再切到 changed，确认只列出改过出厂值的参数。', '长按菜单键 600ms 切主/辅显示区；切到 fault 看故障列表。'],
    expect: `basic 显示全部 39 个参数；user 默认 4 项；changed 只列偏离默认值的码；fault 显示 6 条教学故障码。`,
    watch: '辅显示区代码、菜单指示灯', trap: '长按必须超过 600ms，短按只切菜单。' },
  { g: 'A', n: 3, name: '面板 RUN/STOP 与预置频率', mode: '手动',
    goal: '理解面板命令源与加减速斜坡，建立频率与 3D 转速的对应关系。',
    steps: [`确认 ${'`F0-02=0`'}（操作面板）、${'`F0-03=0`'}（数字设定）、${'`F0-08`'} = ${D['F0-08']}Hz、${'`F0-17`'} = ${D['F0-17']}s。`, '按 RUN，每 1 秒记录一次输出频率；到稳态后按 STOP。', `把 ${'`F0-17`'} 改成 2s，复位后重做一次。`],
    expect: `默认 20s 斜坡下 1 秒约升 2.5Hz、约 20 秒到 ${D['F0-08']}Hz；改成 2s 后 1 秒约升 25Hz。3D 风扇、双滚筒、皮带条纹与频率牌同步。`,
    watch: '主显输出频率、3D 风扇转速、皮带条纹位移', trap: '斜坡时间是从 0 到最大频率的时间，不是到目标频率的时间。' },
  { g: 'A', n: 4, name: '参数初始化 FP-01 六档', mode: '手动',
    goal: '分辨恢复出厂、保留电机铭牌、清记录与备份用户参数的差别。',
    steps: [`先把 ${'`F1-05`'} 从 ${D['F1-05']}rpm 改成 2000rpm，并制造一条故障记录。`, '依次试 FP-01=1、2、4、501、503，每次记录 F1-05 与故障列表。'],
    expect: `=1 时 F1 铭牌保持 2000rpm；=2 只清故障记录、参数不动；=503 全部回出厂（F1-05=${D['F1-05']}）；=4 / 501 为备份/恢复用户参数（教学镜像）。`,
    watch: '参数菜单、fault 菜单', trap: 'FP-01 是「停机更改」，运行中改不了；0=无操作。' },
  { g: 'A', n: 5, name: 'FP-02 掩码控制自定义菜单', mode: '手动',
    goal: '理解功能参数组显示选择对菜单的影响，以及基本菜单不受影响。',
    steps: ['记下 user 菜单默认 4 项（F0-02、F0-08、F0-17、F0-18）。', '把 FP-02 设 0，回 user 菜单；再设 63、1023 各看一次。', '每次都切回 basic 对照。'],
    expect: 'FP-02=0 → user 菜单空；=63（默认）→ 4 项；basic 始终是 39 个参数，索引不变。',
    watch: 'user / basic 菜单条数', trap: '低 10 位按组顺序掩码；只作用 user 菜单，别误以为整个参数表被隐藏。' },

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
  { g: 'B', n: 10, name: '485 通信给定与状态回读', mode: '仿真',
    goal: '用控制字与频率给定控制变频器，并读懂回读状态。',
    steps: ['设 F0-02=2、F0-03=9，连 MD520 虚拟 PLC :1507。', 'PLC 侧写 2000H=1（正转）、7310H=3000（30.00Hz）、1000H=6000（60.00%）。', '读 3000H、1001H、1009H、7044H。'],
    expect: '输出 30.00Hz；3000H=1（正转）、1001H=3000（0.01Hz）、1009H 的 DO1 位为 1；停机写 2000H=6 后 3000H=3。',
    watch: '485 只读状态行、:5087/status', trap: '2000H 没有 0 档，写 0 无意义；7310H 是 0.01Hz，1000H 是 ±100.00% 百分比。' },
  { g: 'B', n: 11, name: '加减速时间与基准频率', mode: '手动',
    goal: '对比 F0-17/18 与 F0-25 四档基准对斜坡速率的影响。',
    steps: ['默认 F0-25=0，RUN 后记录 1 秒爬升量。', '依次把 F0-25 设 1（同时 F0-08=30）、2、3（同时 F1-04=25），各跑 1 秒。', '改 F0-18 观察停机回落。'],
    expect: '1 秒爬升量依次为 2.5 / 1.5 / 5 / 1.25Hz；F0-18 变小时回落明显加快。默认档 0 与旧行为一致。',
    watch: '主显输出频率、3D 转速', trap: 'F0-25=1 的基准是「设定频率」，所以要先改 F0-08 才看得出差别。' },
  { g: 'B', n: 12, name: '最大频率与控制方式', mode: '手动',
    goal: '理解 F0-10 上限、FC 换算基准，以及 F0-01 三种控制方式的教学近似。',
    steps: ['段 2（40%）下把 F0-10 从 50 改 60，记录频率。', '把 F0-01 依次设 0(SVC)、1(FVC)、2(V/f)，各 RUN 1 秒记录爬升量。'],
    expect: 'F0-10=60 后段 2 从 20Hz 变 24Hz；1 秒爬升 SVC 4.0Hz / FVC 3.13Hz / V/f 2.5Hz；FVC 频率到达灯容差更宽。',
    watch: '段速标签、FM 徽标、3D', trap: '这里只是低速段增益近似，没有真实矢量控制算法。' },

  // C 停机方向与状态
  { g: 'C', n: 13, name: 'F6-10 三种停机方式', mode: '手动',
    goal: '对比减速停机、自由停机、最大能力停机的曲线差异。',
    steps: ['先 RUN 到 50Hz。', '把 F6-10 依次设 0、1、2，每次从 50Hz 按 STOP，0.5 秒后记录输出频率。'],
    expect: 'F6-10=0 约 48.75Hz（按 F0-18 减速）；=1 → 0Hz（立即断输出）；=2 约 43.75Hz（F0-18/5 强制斜坡）。',
    watch: '主显输出频率、3D 是否立即停转', trap: '自由停机不是「慢慢停」，是立刻断输出。' },
  { g: 'C', n: 14, name: 'F6-11~14 直流制动段', mode: '手动',
    goal: '观察制动起始频率、等待时间、制动电流对自由停机过程的影响。',
    steps: ['设 F6-10=1、F6-14=2（制动时间 2s），从 50Hz STOP，记录 0.3 秒频率。', '把 F6-13 从 50% 改 100% 重做；再设 F6-11=20、F6-12=1 各做一次。'],
    expect: 'F6-14>0 时自由停机不再瞬间归零，而是有制动减速段；F6-13=100% 比 50% 降得快；F6-12 拉长时间；F6-11 高于当前频率时不加制动增益。',
    watch: '主显输出频率、停机用时', trap: '这四个参数只在 F6-14>0 的制动段生效，默认 0/0/50 时行为与只看 F6-14 一致。' },
  { g: 'C', n: 15, name: 'F7-02 STOP/RESET 四档', mode: '手动',
    goal: '理解 OFF1/OFF2/OFF3 对停机方式的覆盖。',
    steps: ['保持 F6-10=0（减速停机），把 F7-02 依次设 0、1、2、3，各从 50Hz STOP。'],
    expect: '=0 沿用 F6-10 减速；=1(OFF1) 立刻自由停机；=2(OFF2) 最大能力停机；=3(OFF3) 减速停机。',
    watch: '输出频率回落曲线', trap: 'F7-02 优先级高于 F6-10，排查停机异常时先看它。' },
  { g: 'C', n: 16, name: 'MF.K 五档功能', mode: '手动',
    goal: '掌握 F7-01 五档分派与「仅操作面板命令源有效」的约束。',
    steps: ['F7-01 依次设 0、1、2、3、4，每档按一次 MF.K 观察。', '把 F0-02 改成 2（通信）后，再试 F7-01=2/3/4。'],
    expect: '=0 无动作；=1 把命令源切回面板；=2 正反转切换；=3/4 正/反转点动（5Hz 上限）。F0-02≠0 时 2/3/4 全部无效。',
    watch: 'FWD/REV 丝印、运行/停机、控制字', trap: '手册 285 页表 16-6：2、3、4 只在 F0-02=0 有效。' },
  { g: 'C', n: 17, name: '正反转切换：减速到零再反向加速', mode: '手动',
    goal: '验证换向不是瞬间反转，而是先按 F0-18 减速到 0、翻转输出方向、再按 F0-17 反向加速。',
    steps: ['设 F7-01=2、F0-02=0，RUN 到有输出（建议先把 F0-18 / F0-17 改小到 2s 缩短等待）。', '按 MF.K，立刻看 __dtVfdDrive：targetDirection 变 -1、direction 仍是 1、reversing=true、hz 持续下降。', '连续采样直到 hz 归零、direction 翻成 -1，再看 hz 反向上升；随后间隔 0.5 秒采两次 fanAngle / beltPhase。'],
    expect: '换向期间电机仍按原方向转、只是越来越慢（减速阶段风扇角差仍为负）；频率归零后 direction 才由 1 变 -1 并反向加速；风扇角差由负变正（实测 -0.83 → +1.21），皮带相位由正变负（+0.023 → -0.034）；FWD/REV 丝印指令下达即互换。',
    watch: '__dtVfdDrive.direction / targetDirection / reversing / hz / fanAngle / beltPhase、FWD/REV 灯', trap: '别在减速阶段就断言反向：那时 direction 还是 1；面板丝印显示的是目标方向，3D 用的是实际输出方向 runDirection。' },
  { g: 'C', n: 18, name: 'DO 状态、故障与只读监视量', mode: '手动 + 仿真',
    goal: '读懂 DO1/FM/RELAY、3000H 状态与输出电流/功率监视量。',
    steps: ['RUN 到稳态，看 DO1（运行中）、FM（频率到达）亮，RELAY 灭。', '制造故障后看 RELAY 与 3000H=5，再用 STOP/RESET 或 2000H=7 复位。', '把 F1-03 从 9A 改 18A、F1-01 从 3.7 改 7.4kW，看监视量；再设 F1-00=2（永磁同步）。'],
    expect: '满载时默认显示约 9.00A / 3.70kW；铭牌翻倍后约 18.00A / 7.40kW；F1-00=2 时电流 ×0.88；停机后监视量归零。',
    watch: 'DO 只读徽标、data-dt-vfd-monitor、3000H / 7044H', trap: '这些监视量是教学近似（空载 15% 电流 + 负载率线性），不是真实电机模型。' },

  // D 外部 PLC 三协议
  { g: 'D', n: 19, name: 'AutoShop / Modbus TCP 读写', mode: '仿真',
    goal: '用 PLC 程序通过 coils 与 15 个数值字控制变频器。',
    steps: ['连接预设选「汇川H5U (Modbus)」或「MD520 虚拟 PLC」:1507。', 'PLC 侧写 coils 130~134（DI1~DI5），读 140~142。', '写 2000H / 7310H / 1000H，读 3000H / 1001H / 1009H。'],
    expect: '写入 DI 位组合后 1008H 位字同步（例 130/132/133 置位 → 0b01101=13）；变频器 DO 三路回写到 140~142。',
    watch: ':5087/status 的 io 与 words、1008H / 1009H', trap: '外部写入 130~134 后内置参考程序让位 2 秒，超时会恢复覆盖。' },
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
  { g: 'D', n: 23, name: '三协议对照与外部写入让位', mode: '仿真',
    goal: '同一控制逻辑换三种 PLC，观察点位映射与让位机制。',
    steps: ['用同一段速逻辑分别跑 Modbus TCP / S7 / 三菱，记录各自点位。', '连 :1507 时从 Node 侧直接写 coils 130~134，马上读 :5087/status。'],
    expect: '三种协议下变频器行为一致；/status 的 externalDi=true，2 秒内内置参考程序不覆盖外部给定。',
    watch: '三协议地址表、:5087/status.externalDi', trap: '让位只有 2 秒，连续实验要持续发帧或关掉内置参考程序。' },

  // E B 档 485 主从
  { g: 'E', n: 24, name: '纯从站 :1508 发真实帧', mode: '帧级',
    goal: '验证独立从站只响应主站帧，不自己改寄存器。',
    steps: ['用 modbus-serial 客户端连 127.0.0.1:1508，unitId=1。', '发 FC03 读 3000H、FC06 写 7310H、FC05 写 coil 140、FC15 批写 140~142、FC01 回读。', '读 :5088/status。'],
    expect: 'role=pure-slave；FC01 按字节返回 8 位，前 3 位与写入一致；masterFrames 随轮询增长。',
    watch: ':5088/status、主站日志', trap: 'FC01 返回值可能多于请求位数，比较时取 slice(0,3)；2000H/7310H/1000H 会被内置主站每 200ms 覆盖。' },
  { g: 'E', n: 25, name: '内置主站轮询节拍', mode: '帧级',
    goal: '观察真实 Modbus 主站 200ms 轮询与联锁读回。',
    steps: ['启动实验室（不要设 DT_VFD_485_MASTER=0），看主站日志。', '每隔 1 秒读一次 :5088/status 的 masterFrames 与 2000H。'],
    expect: '日志出现「停机 → 运行 30Hz → 运行 50Hz」4s 运行 / 2s 停机循环；联锁打印 3000H / 1001H / 1009H；2000H 恒为 1 或 6，不出现 0。',
    watch: 'start:lab 控制台、:5088/status', trap: '主站是演示用途，接真实 PLC 时要关掉。' },
  { g: 'E', n: 26, name: '外部 PLC 独占从站', mode: '帧级',
    goal: '让外部 PLC 成为唯一主站，避免两个主站抢写。',
    steps: ['以 DT_VFD_485_MASTER=0 启动实验室。', '外部 PLC（AutoShop / 博途 / GX Works2 / 实物）连 :1508 发 FC06/FC16 写、FC03 读。'],
    expect: '只有外部主站的帧改变从站；:5088/status 的 masterFrames 只随外部帧增长。',
    watch: ':5088/status、外部 PLC 在线表', trap: '不关内置主站会导致两边交替覆盖 2000H/7310H，现象像「给定抖动」。' },
  { g: 'E', n: 27, name: 'A/B 隔离与面板跟随 B 档', mode: '仿真 + 帧级',
    goal: '验证 B 档寄存器区与教学 :1507 完全独立，并让面板跟随 B 档。',
    steps: ['往 :1508 写 7310H=1234，同时读 :5087/status 与 :5088/status 的 7310H。', '连接预设切「MD520 485 从站 B档」127.0.0.1:1508，看面板/3D 是否跟随。'],
    expect: '两个 words[7310H] 互不相同；切到 :1508 后面板数值与 3D 转速跟随 B 档从站，:1507 不受影响。',
    watch: '两个 status 口、面板主显', trap: '切预设后参数源（F002H 等）是 B 档自己的值，需要 PLC 程序重新下发。' },

  // F 平台与安全
  { g: 'F', n: 28, name: '主控—观众只读跟随', mode: '平台',
    goal: '验证 LAN 观众自动跟随、只读、零上行。',
    steps: ['装软件的机器开 http://127.0.0.1:5201/ 作为主控，进 MD520 场景。', '另一台设备用界面底部显示的局域网 IP 访问，不做任何点击。', '主控改参数/按 RUN，观察观众端数值与 3D。'],
    expect: '观众端无角色页、无房间码；键盘/DI/AI 全部 disabled；数值随主控快照更新；观众不建 PLC 通道。',
    watch: '观众端面板、:5201 界面底部 IP、中继快照', trap: '同一时刻只允许一个主控上报；第二个主控会被拒，关闭多余主控页面即可。' },
  { g: 'F', n: 29, name: '拓扑与 P0 安全认知', mode: '平台',
    goal: '理解 8 进程 / 10 口、回环绑定与出站白名单。',
    steps: ['看 start:lab 启动日志，列出全部内部端口。', '确认只有 :5201 对外，其余绑 127.0.0.1。', '查 DT_PLC_HOSTS 默认值与每次重签的内部 token。'],
    expect: '8081 网关 / 8082 中继 / 1505+5085 配药 / 1503+5083 分拣 / 1507+5087 教学 / 1508+5088 B 档，全部回环；汇川龙门仿真走外部 PLC 仿真软件 :502，接实体 PLC 需显式放行。',
    watch: '启动日志、lab-info.json、security-check 34 项', trap: '不要为图方便把内部口改成 0.0.0.0；端口漂移会触发 assertInternalPorts 拒绝启动。' },
  { g: 'F', n: 30, name: '教学近似边界识别', mode: '综合',
    goal: '分清哪些参数改了真有效果、哪些只存值，避免把教学模型当真机。',
    steps: ['打开教学手册第 3/4 章，对照「生效 / 仅显示」列。', `挑 F0-17、FC-02、F6-10、F4-00、F5-04、F1-02 各改一次，记录有无现象。`, '总结哪些属于矢量控制/直流制动/DO 可写等未实现范围。'],
    expect: 'F0-17 / FC-02 / F6-10 有现象；F4-00 / F5-04 / F1-02 只存值；SVC/FVC 只是低速段增益，没有真实矢量算法。',
    watch: '教学手册参数表、面板与 3D', trap: '09 参数手册抽取失败，未收录的码不猜默认值；参数/故障码都是教学子集。' },
];

const GROUPS = {
  A: '面板与菜单', B: '给定与频率', C: '停机方向与状态',
  D: '外部 PLC 三协议', E: 'B 档真实 485 主从', F: '平台与安全',
};
const GROUP_COLOR = { A: '#185FA5', B: '#0F6E56', C: '#BA7517', D: '#534AB7', E: '#993C1D', F: '#5F5E5A' };

const quickRows = LABS.map((l) => `<tr><td class="num">${l.n}</td><td><a href="#lab${l.n}">${esc(l.name)}</a></td><td>${GROUPS[l.g]}</td><td>${esc(l.mode)}</td></tr>`).join('\n');

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
<p class="notice"><b>教学边界</b>：变频器是教学子集，不是真机。矢量控制、直流制动电流闭环、电机辨识均为近似或不做；39 个参数里约 20 多个真正生效，其余只存值；S7 / 三菱 / AutoShop 的真实仿真站与实物 PLC 本机未跑，相关实验只能做网关层与帧级验证。</p>
</header>
<nav>${Object.keys(GROUPS).map((g) => `<a href="#grp${g}">${g} ${GROUPS[g]}</a>`).join('')}</nav>
<h2>实验速查表</h2>
<table><tr><th>编号</th><th>实验名称</th><th>类别</th><th>所需模式</th></tr>${quickRows}</table>
${sections}
<h2>通用观察窗口</h2>
<table><tr><th>窗口</th><th>看什么</th></tr>
<tr><td>面板</td><td>主/辅显示、FWD/REV 丝印、DO 只读徽标、485 状态行、输出电流/功率</td></tr>
<tr><td>3D 装置</td><td>风扇与双滚筒角速度、皮带条纹位移、LED 状态灯、频率数字牌；<code>?debug=1</code> 下 <code>__dtVfdDrive</code> 有 direction / fanAngle / beltPhase</td></tr>
<tr><td>状态口</td><td><code>:5087/status</code>（教学虚拟 PLC）、<code>:5088/status</code>（B 档纯从站，含 masterFrames / externalDi）</td></tr>
<tr><td>帧级探针</td><td>485 帧级、布尔链路、主探针 / 三接口专项 / 方向专项 CDP 验收脚本</td></tr></table>
<h2>建议课时顺序</h2>
<p>入门：实验 1~5（面板与菜单）→ 6~12（给定与频率）；进阶：13~18（停机、方向、状态）；综合：19~23（外部 PLC 三协议）→ 24~27（B 档真实主从）→ 28~30（平台与边界）。配套参考《MD520教学手册.html》。</p>
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
`;
fs.writeFileSync(tsPath, generatedTs, 'utf8');

const webDir = path.resolve(__dirname, '../../platform/public/docs');
fs.mkdirSync(webDir, { recursive: true });
const webPath = path.join(webDir, 'MD520实验指导书.html');
fs.writeFileSync(webPath, html, 'utf8');

console.log(`OK ${OUT}`);
console.log(`OK ${tsPath}`);
console.log(`OK ${webPath}`);
console.log(`labs=${LABS.length} groups=${Object.keys(GROUPS).length} defaults F0-08=${D['F0-08']} F0-17=${D['F0-17']} F1-05=${D['F1-05']}`);
