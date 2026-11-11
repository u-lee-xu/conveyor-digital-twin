/**
 * MD520 LED 操作面板键盘状态机（纯函数，可单测）。
 *
 * 依据用户手册 16.3「参数设置」+ 快速入门表 4-2「按键说明」：
 *  - 三级菜单：一级参数组 → 二级参数 → 三级设定值
 *  - 确认键：保存设定值、返回二级菜单并自动转移到下一个参数
 *  - 编程/返回键：放弃当前修改，直接返回上一级
 *  - 参数页：上下键调设定值、左右键选设定位（闪烁位）、OK 确认
 *  - 监控页：下键作键盘电位计、左右键切换监控变量
 *  - 菜单键：点按切 4 种菜单，长按切主/辅显示区
 *  - 故障列表：左右键循环切换故障历史记录
 */
import {
  MD520_GROUPS, MD520_MENUS, MD520_PARAMS, MD520_PARAM_MAP, MD520_COMMAND,
  type Md520Menu, type Md520Param,
} from './md520Spec';

export type KeypadArea = 'main' | 'aux';
export type KeypadLevel = 0 | 1 | 2 | 3;
export type KeypadKey =
  | 'MENU' | 'MENU_LONG' | 'PRG' | 'OK' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  | 'RUN' | 'STOP' | 'MFK';

export interface KeypadState {
  area: KeypadArea;
  menu: Md520Menu;
  level: KeypadLevel;
  groupIndex: number;
  paramIndex: number;
  digit: number;
  editValue: number;
  monitorIndex: number;
  faultIndex: number;
}

export interface KeypadEvent {
  commit?: { code: string; value: number };
  run?: boolean;
  stop?: boolean;
  resetFault?: boolean;
  toggleDirection?: boolean;
  /** MF.K：F7-01=1 强制面板控制 / 3~4 点动（值为控制命令） */
  forcePanel?: boolean;
  jog?: number;
  potentiometer?: number;
  message?: string;
}

export interface KeypadResult {
  state: KeypadState;
  event?: KeypadEvent;
}

export const INITIAL_KEYPAD: KeypadState = {
  area: 'main',
  menu: 'basic',
  level: 0,
  groupIndex: 0,
  paramIndex: 0,
  digit: 0,
  editValue: 0,
  monitorIndex: 0,
  faultIndex: 0,
};

/** 当前菜单下可见的参数（用户自定义参数 / 用户更改参数按真实语义过滤） */
export function visibleParams(menu: Md520Menu, values: Record<string, number>): Md520Param[] {
  if (menu === 'user') {
    return MD520_PARAMS.filter((p) => ['F0-02', 'F0-08', 'F0-17', 'F0-18'].includes(p.code));
  }
  if (menu === 'changed') {
    return MD520_PARAMS.filter((p) => {
      const v = values[p.code];
      return typeof v === 'number' && Math.abs(v - p.defaultValue) > 1e-6;
    });
  }
  return MD520_PARAMS;
}

export function currentGroup(state: KeypadState): string {
  return MD520_GROUPS[state.groupIndex] ?? MD520_GROUPS[0];
}

export function groupParams(state: KeypadState, values: Record<string, number>): Md520Param[] {
  const group = currentGroup(state);
  return visibleParams(state.menu, values).filter((p) => p.group === group);
}

export function currentParam(state: KeypadState, values: Record<string, number>): Md520Param | undefined {
  const list = groupParams(state, values);
  return list[state.paramIndex] ?? list[0];
}

/**
 * 五位主显示区里**实际可编辑**的位对应的 10 的幂（含小数位）。
 * 真实面板不会让 F0-02（0~3）出现万位闪烁：整数位数由参数上限决定，
 * 高位补 0 且不可编辑；闪烁位从最低位开始，与 MD520 选位修改一致。
 */
export function digitPlaces(p: Md520Param): number[] {
  const maxInt = Math.max(1, String(Math.trunc(Math.abs(p.max))).length);
  const intDigits = Math.min(5 - p.decimals, maxInt);
  return Array.from({ length: intDigits + p.decimals }, (_, i) => 10 ** (intDigits - 1 - i));
}

/** 可编辑位在 5 位主显示区里的下标（高位补 0 后右对齐） */
export function blinkPosition(p: Md520Param, digit: number): number {
  return 5 - digitPlaces(p).length + digit;
}

/** 把数值格式化成主显示区的 5 位数字字符（小数点单独渲染为 DP） */
export function formatMain(p: Md520Param, value: number): string {
  const fixed = Math.max(0, Math.min(p.max, value)).toFixed(p.decimals);
  const raw = fixed.replace('.', '');
  return raw.padStart(5, '0').slice(-5);
}

export function clampParam(p: Md520Param, value: number): number {
  const factor = 10 ** p.decimals;
  const rounded = Math.round(value * factor) / factor;
  return Math.max(p.min, Math.min(p.max, rounded));
}

function nextMenu(menu: Md520Menu, step: number): Md520Menu {
  const i = MD520_MENUS.indexOf(menu);
  return MD520_MENUS[(i + step + MD520_MENUS.length) % MD520_MENUS.length];
}

function cycle(value: number, step: number, length: number): number {
  if (length <= 0) return 0;
  return (value + step + length) % length;
}

/**
 * 键盘事件归约。values 是当前参数真值，running 决定是否允许改 runLocked 参数。
 * 不写 store、不碰 PLC，纯函数便于单测与防回退断言。
 */
export function reduceKeypad(
  state: KeypadState,
  key: KeypadKey,
  values: Record<string, number>,
  running: boolean,
  faultCount = 0,
): KeypadResult {
  const s: KeypadState = { ...state };
  let event: KeypadEvent | undefined;

  // 全局键：菜单键、运行/停机/复位、MF.K
  if (key === 'MENU_LONG') {
    s.area = s.area === 'main' ? 'aux' : 'main';
    return { state: s };
  }
  if (key === 'MENU') {
    if (s.level === 0) s.menu = nextMenu(s.menu, 1);
    else { s.level = 0; s.menu = nextMenu(s.menu, 1); }
    return { state: s };
  }
  if (key === 'RUN') { event = { run: true }; return { state: s, event }; }
  if (key === 'STOP') { event = { stop: true, resetFault: true }; return { state: s, event }; }
  /**
   * 285 页表 16-6 / 16.7：MF.K 的功能由 F7-01 决定，不能无条件翻转方向。
   *  0 无效 / 1 强制面板控制 / 2 正反转切换 / 3 正转点动 / 4 反转点动；
   *  其中 2/3/4 只在「命令源运行指令 = 操作面板（F0-02=0）」时有效。
   */
  if (key === 'MFK') {
    const fn = Math.trunc(values['F7-01'] ?? 0);
    const panelSource = Math.trunc(values['F0-02'] ?? 0) === 0;
    if (fn === 1) event = { forcePanel: true };
    else if (fn === 2 && panelSource) event = { toggleDirection: true };
    else if (fn === 3 && panelSource) event = { jog: MD520_COMMAND.FJOG };
    else if (fn === 4 && panelSource) event = { jog: MD520_COMMAND.RJOG };
    // F7-01=0（此键无功能）或命令源非面板：按手册不产生任何效果
    return { state: s, event };
  }

  if (s.level === 0) {
    switch (key) {
      case 'PRG': s.level = 1; break;
      case 'UP': s.monitorIndex = cycle(s.monitorIndex, 1, 8); break;
      case 'DOWN': event = { potentiometer: -1 }; break;
      case 'LEFT':
        if (s.menu === 'fault') s.faultIndex = cycle(s.faultIndex, -1, Math.max(1, faultCount));
        else s.monitorIndex = cycle(s.monitorIndex, -1, 8);
        break;
      case 'RIGHT':
        if (s.menu === 'fault') s.faultIndex = cycle(s.faultIndex, 1, Math.max(1, faultCount));
        else s.monitorIndex = cycle(s.monitorIndex, 1, 8);
        break;
      case 'OK': s.level = 1; break;
      default: break;
    }
    return { state: s, event };
  }

  if (s.level === 1) {
    switch (key) {
      case 'UP': s.groupIndex = cycle(s.groupIndex, 1, MD520_GROUPS.length); s.paramIndex = 0; break;
      case 'DOWN': s.groupIndex = cycle(s.groupIndex, -1, MD520_GROUPS.length); s.paramIndex = 0; break;
      case 'OK': s.level = 2; s.paramIndex = 0; break;
      case 'PRG': s.level = 0; break;
      default: break;
    }
    return { state: s, event };
  }

  const list = groupParams(s, values);

  if (s.level === 2) {
    switch (key) {
      case 'UP': s.paramIndex = cycle(s.paramIndex, 1, list.length); break;
      case 'DOWN': s.paramIndex = cycle(s.paramIndex, -1, list.length); break;
      case 'PRG': s.level = 1; break;
      case 'OK': {
        const p = list[s.paramIndex];
        if (!p) break;
        if (p.readOnly) { event = { message: '只读参数' }; break; }
        if (p.runLocked && running) { event = { message: '运行中不可修改' }; break; }
        s.level = 3;
        s.editValue = values[p.code] ?? p.defaultValue;
        s.digit = Math.max(0, digitPlaces(p).length - 1);
        break;
      }
      default: break;
    }
    return { state: s, event };
  }

  // level 3：参数设定值编辑
  const p = list[s.paramIndex] ?? currentParam(s, values);
  if (!p) { s.level = 2; return { state: s }; }

  const places = digitPlaces(p);

  switch (key) {
    case 'LEFT': s.digit = cycle(s.digit, -1, places.length); break;
    case 'RIGHT': s.digit = cycle(s.digit, 1, places.length); break;
    case 'UP':
    case 'DOWN': {
      const place = places[s.digit] ?? 1;
      s.editValue = clampParam(p, s.editValue + (key === 'UP' ? place : -place));
      break;
    }
    case 'PRG':
      // 放弃当前修改，返回二级菜单
      s.level = 2;
      s.editValue = values[p.code] ?? p.defaultValue;
      break;
    case 'OK':
      event = { commit: { code: p.code, value: s.editValue } };
      // 保存后返回二级菜单并自动转移到下一个参数
      s.level = 2;
      s.paramIndex = cycle(s.paramIndex, 1, Math.max(1, list.length));
      s.editValue = 0;
      break;
    default: break;
  }
  return { state: s, event };
}

/** 供 UI 显示「当前参数码 / 组 / 设定值」的纯函数 */
export function keypadDisplay(
  state: KeypadState,
  values: Record<string, number>,
  faults: readonly { code: string }[],
): { main: string; aux: string; decimals: number; unit: string; blinkDigit: number | null } {
  if (state.level === 1) {
    return { main: currentGroup(state), aux: '', decimals: 0, unit: '', blinkDigit: null };
  }
  if (state.level === 2) {
    const p = currentParam(state, values);
    return { main: p?.code ?? '----', aux: '', decimals: 0, unit: '', blinkDigit: null };
  }
  if (state.level === 3) {
    const p = currentParam(state, values);
    if (!p) return { main: '-----', aux: '', decimals: 0, unit: '', blinkDigit: null };
    return {
      main: formatMain(p, state.editValue),
      aux: p.code,
      decimals: p.decimals,
      unit: p.unit,
      blinkDigit: blinkPosition(p, state.digit),
    };
  }
  if (state.menu === 'fault') {
    const f = faults[state.faultIndex];
    return { main: f?.code ?? 'null', aux: '', decimals: 0, unit: '', blinkDigit: null };
  }
  const p = MD520_PARAM_MAP['U0-00'];
  return {
    main: formatMain(p, values['U0-00'] ?? 0),
    aux: '',
    decimals: p.decimals,
    unit: p.unit,
    blinkDigit: null,
  };
}
