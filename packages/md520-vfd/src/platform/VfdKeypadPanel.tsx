/**
 * 汇川 MD520 变频器 LED 操作面板。
 *
 * 外观按用户手册 16.1 / 快速入门表 4-1~4-3 / 图 4-3 真机面板复刻：
 *  - 浅灰双层圆角外壳、独立显示窗；窗内左侧 FWD/REV/DRIVE/AXIS 丝印 + 状态图标，
 *    6 位斜体辅显示区 + 5 位主显示区、单位灯一行、右侧移位箭头
 *  - 显示窗下方 4 菜单指示灯 + 竖线分隔
 *  - 按键区：左右竖长 PRG/MENU、圆形导航环（上下左右 + 中央 OK）、
 *    左下斜置 RUN、右下斜置 STOP、底部 MF.K 胶囊键
 *  - 三级菜单、闪烁位编辑、OK 保存并跳下一参数、PRG 放弃、菜单键长按切主辅显示区
 *
 * DI / AI / 485 / DO 是教学扩展，收在外壳下方的紧凑信号区；真机没有这些控件。
 * 面板不写任何原理说明，可见文案不带中文括号。
 */
import { Fragment, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { isViewerRuntime } from '@digital-twin/shared';
import { useVfdStore } from '../stores/useVfdStore';
import { keypadDisplay, type KeypadKey } from '../vfd/md520Keypad';
import {
  MD520_DI, MD520_DO, MD520_FAULTS, MD520_MENUS, MD520_MENU_LABELS,
  MD520_PARAM_MAP, MD520_UNITS, MD520_AI, MD520_COMM,
} from '../vfd/md520Spec';

const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', b: 'cdefg', C: 'adef', d: 'bcdeg', E: 'adefg', F: 'aefg',
  r: 'eg', H: 'bcefg', J: 'bcd', L: 'def', n: 'ceg', o: 'cdeg',
  P: 'abefg', T: 'defg', U: 'bcdef', y: 'bcdfg', '-': 'g', ' ': '',
};

const SEG_RECT: Record<string, [number, number, number, number]> = {
  a: [4, 1, 12, 2.5], b: [16, 3.5, 2.5, 10], c: [16, 17, 2.5, 10],
  d: [4, 28, 12, 2.5], e: [1.5, 17, 2.5, 10], f: [1.5, 3.5, 2.5, 10],
  g: [4, 14.5, 12, 2.5],
};

/** 真机灰白面板配色，唯一来源 */
const C = {
  shellEdge: '#8b97a3',
  shell: 'linear-gradient(158deg,#f0f3f6 0%,#d9dfe5 46%,#bcc6d0 100%)',
  shellLine: '#a5b0bb',
  window: 'linear-gradient(180deg,#d2dbe2 0%,#bcc7d1 100%)',
  windowEdge: '#7c8995',
  ink: '#33404d',
  inkSoft: '#6d7a86',
  segOn: '#df432b',
  segOff: 'rgba(70,84,96,.17)',
  ledOn: '#df432b',
  ledOff: 'rgba(70,84,96,.20)',
  key: 'linear-gradient(180deg,#f5f7f9 0%,#cbd4dc 100%)',
  keyFill: '#e8edf1',
  /** 按下态：键帽压深一档，配合下沉与高光减弱形成实体触感 */
  keyFillPressed: '#c2cdd9',
  keyEdge: '#8995a1',
  keyInk: '#35424e',
  signal: 'rgba(112,128,142,.16)',
  signalEdge: 'rgba(84,100,114,.38)',
};

const MENU_ICONS: Record<string, string> = {
  basic: '⚙', user: 'F2', changed: '✎', fault: '⚠',
};

/** 斜体七段数码管：aux 是 6 位小辅显示，main 是 5 位大主显示 */
function SevenSegment({ chars, dotIndex, blinkIndex, aux }: {
  chars: string; dotIndex: number | null; blinkIndex: number | null; aux?: boolean;
}) {
  const list = chars.split('').slice(0, aux ? 6 : 5);
  const w = aux ? 14 : 24;
  const h = aux ? 21 : 38;
  return (
    <div style={{ display: 'flex', gap: aux ? 1 : 2, transform: 'skewX(-7deg)' }}>
      {list.map((ch, i) => {
        const on = SEGMENTS[ch] ?? '';
        return (
          <svg key={i} width={w} height={h} viewBox="0 0 20 32" aria-hidden="true"
            style={{ opacity: blinkIndex === i ? 0.45 : 1 }}>
            {Object.entries(SEG_RECT).map(([seg, [x, y, sw, sh]]) => (
              <rect key={seg} x={x} y={y} width={sw} height={sh} rx={aux ? 0.7 : 1}
                fill={on.includes(seg) ? C.segOn : C.segOff} />
            ))}
            {dotIndex === i && <circle cx={18.2} cy={29} r={1.7} fill={C.segOn} />}
          </svg>
        );
      })}
    </div>
  );
}

/** 显示窗顶部的状态图标：方框、三角警告、菱形、圆内三角 */
function StatusIcon({ children, on, round }: {
  children: string; on: boolean; round?: boolean;
}) {
  return (
    <span style={{
      width: 21, height: 19, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      border: `1.2px solid ${on ? C.ledOn : C.inkSoft}`,
      borderRadius: round ? '50%' : 3,
      color: on ? C.ledOn : C.inkSoft, fontSize: 10, fontWeight: 700, lineHeight: 1,
      background: on ? 'rgba(223,67,43,.10)' : 'transparent',
    }}>{children}</span>
  );
}

/**
 * 真机按键轮廓（手册图 4-3 下半部分）：
 * 四瓣导航键的内侧是**凹弧**，用来让开中央 OK 圆钮；所有按键都有外层描边 +
 * 内缩一圈细线，模拟实体按键的双层凸缘。CSS border-radius 画不出凹弧，改走 SVG path。
 */
type KeyShape = 'up' | 'down' | 'left' | 'right' | 'ok' | 'tall' | 'tilt' | 'mfk';

const PATHS: Record<KeyShape, (w: number, h: number) => string> = {
  up: (w, h) => `M 3 ${h - 4} C 3 6 ${w * 0.22} 2 ${w / 2} 2 C ${w * 0.78} 2 ${w - 3} 6 ${w - 3} ${h - 4} Q ${w / 2} ${h * 0.44} 3 ${h - 4} Z`,
  down: (w, h) => `M 3 4 Q ${w / 2} ${h * 0.56} ${w - 3} 4 C ${w - 3} ${h - 6} ${w * 0.78} ${h - 2} ${w / 2} ${h - 2} C ${w * 0.22} ${h - 2} 3 ${h - 6} 3 4 Z`,
  left: (w, h) => `M ${w - 3} 3 C ${w * 0.20} 3 3 ${h * 0.20} 3 ${h / 2} C 3 ${h * 0.80} ${w * 0.20} ${h - 3} ${w - 3} ${h - 3} Q ${w * 0.55} ${h / 2} ${w - 3} 3 Z`,
  right: (w, h) => `M 3 3 C ${w * 0.80} 3 ${w - 3} ${h * 0.20} ${w - 3} ${h / 2} C ${w - 3} ${h * 0.80} ${w * 0.80} ${h - 3} 3 ${h - 3} Q ${w * 0.45} ${h / 2} 3 3 Z`,
  ok: (w, h) => `M ${w / 2} 2 C ${w * 0.78} 2 ${w - 2} ${h * 0.22} ${w - 2} ${h / 2} C ${w - 2} ${h * 0.78} ${w * 0.78} ${h - 2} ${w / 2} ${h - 2} C ${w * 0.22} ${h - 2} 2 ${h * 0.78} 2 ${h / 2} C 2 ${h * 0.22} ${w * 0.22} 2 ${w / 2} 2 Z`,
  tall: (w, h) => `M 10 2 L ${w - 10} 2 Q ${w - 2} 2 ${w - 2} 10 L ${w - 2} ${h - 10} Q ${w - 2} ${h - 2} ${w - 10} ${h - 2} L 10 ${h - 2} Q 2 ${h - 2} 2 ${h - 10} L 2 10 Q 2 2 10 2 Z`,
  tilt: (w, h) => `M 14 2 L ${w - 14} 2 Q ${w - 2} 2 ${w - 2} 14 L ${w - 2} ${h - 14} Q ${w - 2} ${h - 2} ${w - 14} ${h - 2} L 14 ${h - 2} Q 2 ${h - 2} 2 ${h - 14} L 2 14 Q 2 2 14 2 Z`,
  mfk: (w, h) => `M ${w * 0.13} 3 L ${w * 0.87} 3 Q ${w * 0.94} 3 ${w * 0.95} 10 L ${w - 3} ${h - 10} Q ${w} ${h - 3} ${w * 0.92} ${h - 3} L ${w * 0.08} ${h - 3} Q 0 ${h - 3} 3 ${h - 10} L ${w * 0.05} 10 Q ${w * 0.06} 3 ${w * 0.13} 3 Z`,
};

function KeyOutline({ shape, w, h, pressed }: {
  shape: KeyShape; w: number; h: number; pressed?: boolean;
}) {
  const d = PATHS[shape](w, h);
  const inner = `translate(${w / 2} ${h / 2}) scale(0.88) translate(${-w / 2} ${-h / 2})`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        filter: pressed
          ? 'drop-shadow(0 0 1px rgba(38,50,62,.16))'
          : 'drop-shadow(0 2px 2px rgba(38,50,62,.30))',
        transition: 'filter 130ms ease' }}>
      <path d={d} fill={pressed ? C.keyFillPressed : C.keyFill}
        stroke={C.keyEdge} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={d} fill="none"
        stroke={pressed ? 'rgba(255,255,255,.48)' : 'rgba(255,255,255,.88)'}
        strokeWidth="1" strokeLinejoin="round" transform={inner} />
    </svg>
  );
}

const KEY_BASE: CSSProperties = {
  position: 'absolute', padding: 0, margin: 0,
  background: 'transparent', border: 'none', boxShadow: 'none',
  color: C.keyInk,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 15, fontWeight: 700, lineHeight: 1, userSelect: 'none',
};

/**
 * 按键触感：pointer 按下时键帽下沉 2px、缩到 0.96、整体压暗一档，SVG 双层凸缘
 * 的高光与投影同步变弱；松开用带轻微过冲的曲线回弹，模拟实体按键的回位。
 * 静止态 transform 必须与传入 style 完全一致（斜键 30° / 四瓣居中等 CDP 断言依赖），
 * 所以按下变换只做「追加」，绝不改写基础变换。观众只读时不触发。
 */
const KEY_TRANSITION = 'transform 170ms cubic-bezier(.2,.9,.3,1.35), filter 130ms ease';
const KEY_PRESS_TRANSFORM = ' translateY(2px) scale(0.96)';

function PanelKey({ label, name, onPress, disabled, shape, w, h, style, children }: {
  label: KeypadKey; name: string; onPress: (k: KeypadKey) => void;
  disabled: boolean; shape: KeyShape; w: number; h: number;
  style: CSSProperties; children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const down = pressed && !disabled;
  const baseTransform = typeof style.transform === 'string' ? style.transform : '';
  const release = () => setPressed(false);
  return (
    <button type="button" aria-label={name} title={name} disabled={disabled}
      data-dt-vfd-key-pressed={down ? 1 : 0}
      onPointerDown={() => { if (!disabled) setPressed(true); }}
      onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onBlur={release}
      style={{ ...KEY_BASE, width: w, height: h, ...style,
        transform: down ? baseTransform + KEY_PRESS_TRANSFORM : baseTransform,
        filter: down ? 'brightness(0.93)' : 'none',
        transition: KEY_TRANSITION, touchAction: 'none',
        opacity: disabled ? 0.55 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={() => onPress(label)}>
      <KeyOutline shape={shape} w={w} h={h} pressed={down} />
      <span style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</span>
    </button>
  );
}

export function VfdKeypadPanel() {
  const keypad = useVfdStore((s) => s.keypad);
  const params = useVfdStore((s) => s.params);
  const running = useVfdStore((s) => s.running);
  const outputHz = useVfdStore((s) => s.outputHz);
  const direction = useVfdStore((s) => s.direction);
  const di = useVfdStore((s) => s.di);
  const doFlags = useVfdStore((s) => s.doFlags);
  const faultCode = useVfdStore((s) => s.faultCode);
  const commOnline = useVfdStore((s) => s.commOnline);
  const message = useVfdStore((s) => s.message);
  const ai1 = useVfdStore((s) => s.ai1);
  const ai2 = useVfdStore((s) => s.ai2);
  const ai2Mode = useVfdStore((s) => s.ai2Mode);
  const externalSetpointHz = useVfdStore((s) => s.externalSetpointHz);
  const command = useVfdStore((s) => s.command);
  const status = useVfdStore((s) => s.status);
  const engaged = useVfdStore((s) => s.engaged);
  const dispatchKey = useVfdStore((s) => s.dispatchKey);
  const setDi = useVfdStore((s) => s.setDi);
  const setAi1 = useVfdStore((s) => s.setAi1);
  const setAi2 = useVfdStore((s) => s.setAi2);
  const setAi2Mode = useVfdStore((s) => s.setAi2Mode);

  const display = useMemo(
    () => keypadDisplay(keypad, params, MD520_FAULTS),
    [keypad, params],
  );
  const dotIndex = display.decimals > 0 ? 5 - display.decimals - 1 : null;
  // 待机时 6 位辅显示区显示预置频率（两位小数，DP 落在第四位），与 MD520 双区显示一致
  const auxText = display.aux || faultCode || '';
  const auxChars = auxText
    || String(Math.round(Math.max(0, Math.min(999.99, Number(params['F0-08']) || 0)) * 100))
      .padStart(6, '0').slice(-6);
  const auxDotIndex = auxText ? null : 3;
  const current = keypad.level >= 2
    ? MD520_PARAM_MAP[keypadDisplay({ ...keypad, level: 2 }, params, MD520_FAULTS).main]
    : undefined;

  const press = useCallback((k: KeypadKey) => dispatchKey(k), [dispatchKey]);
  /** 观众端只读：面板只镜像数值快照，按键/DI/AI 一律不可操作 */
  const readOnly = isViewerRuntime();

  /** 菜单键短按切菜单，按住 600ms 切主/辅显示区，与真机长按语义一致 */
  const longPress = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const [menuPressed, setMenuPressed] = useState(false);
  const menuDown = () => {
    if (readOnly) return;
    setMenuPressed(true);
    longPress.current.fired = false;
    longPress.current.timer = window.setTimeout(() => {
      longPress.current.fired = true;
      press('MENU_LONG');
    }, 600);
  };
  const menuUp = () => {
    setMenuPressed(false);
    if (longPress.current.timer !== null) {
      window.clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  };
  const menuClick = () => {
    if (longPress.current.fired) { longPress.current.fired = false; return; }
    press('MENU');
  };

  const menuIndex = MD520_MENUS.indexOf(keypad.menu);
  const source = Math.trunc(params['F0-02']);
  const freqSource = Math.trunc(params['F0-03']);
  const multiIndex = (di.DI1 ? 1 : 0) | (di.DI2 ? 2 : 0) | (di.DI3 ? 4 : 0);
  const plcDiFlags = MD520_DI.reduce((acc, d, i) => acc | (di[d.key] ? 1 << i : 0), 0);
  const ai2Max = ai2Mode === 'current' ? MD520_AI.AI2.currentMax : MD520_AI.AI2.max;
  const ai2Unit = ai2Mode === 'current' ? MD520_AI.AI2.currentUnit : MD520_AI.AI2.unit;
  const silk = (on: boolean): CSSProperties => ({ fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
    color: on ? C.ledOn : C.inkSoft });

  return (
    <div
      data-dt-vfd-panel
      data-dt-vfd-shell
      data-dt-vfd-area={keypad.area}
      data-dt-vfd-level={keypad.level}
      data-dt-vfd-menu={keypad.menu}
      data-dt-vfd-group={keypad.groupIndex}
      data-dt-vfd-index={keypad.paramIndex}
      data-dt-vfd-edit={keypad.editValue}
      data-dt-vfd-param={current?.code ?? ''}
      data-dt-vfd-source={source}
      data-dt-vfd-freq-source={freqSource}
      data-dt-vfd-output={outputHz.toFixed(2)}
      data-dt-vfd-running={running ? 1 : 0}
      data-dt-vfd-engaged={engaged ? 1 : 0}
      data-dt-vfd-readonly={readOnly ? 1 : 0}
      style={{ borderRadius: 24, padding: 7, background: C.shell,
        border: `2px solid ${C.shellEdge}`,
        boxShadow: '0 3px 10px rgba(15,23,42,.22), inset 0 1px 0 rgba(255,255,255,.75)' }}>
      {/* 教学信号区按钮的轻触感：与真机按键同一条回弹曲线，只作用于本面板 */}
      <style>{`
        [data-dt-vfd-signal] button { transition: transform 150ms cubic-bezier(.2,.9,.3,1.35), filter 120ms ease; }
        [data-dt-vfd-signal] button:active:not(:disabled) { transform: translateY(1px) scale(0.97); filter: brightness(0.92); }
      `}</style>
      <div style={{ border: `1px solid ${C.shellLine}`, borderRadius: 18, padding: '6px 9px 9px',
        background: 'rgba(255,255,255,.10)' }}>

        {/* 机身丝印：型号与当前给定档位 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          height: 13, padding: '0 3px', marginBottom: 2 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.4, color: C.ink }}>MD520</span>
          <span style={{ fontSize: 9, color: C.inkSoft }}>
            {['面板', '端子', '通信', '自定义'][source] ?? '面板'}
            {' · '}
            {['数字', '掉电记忆', 'AI1', 'AI2', 'AI3', '脉冲', '多段', '简易PLC', 'PID', '通讯'][freqSource] ?? '数字'}
          </span>
        </div>

        {/* 显示窗 */}
        <div data-dt-vfd-window style={{ background: C.window, border: `1.5px solid ${C.windowEdge}`, borderRadius: 12,
          padding: '5px 8px 4px', boxShadow: 'inset 0 2px 5px rgba(50,64,78,.22)',
          display: 'grid', gridTemplateColumns: '40px 1fr', gap: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: '2px 0 4px' }}>
            <span style={silk(running && direction === 1)}>FWD</span>
            <span style={silk(running && direction === -1)}>REV</span>
            <span style={silk(engaged)}>DRIVE</span>
            <span style={silk(false)}>AXIS</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* 状态图标丝印 */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-start' }}>
              <StatusIcon on={source === 0}>▣</StatusIcon>
              <StatusIcon on={false}>T</StatusIcon>
              <StatusIcon on={source !== 3}>S</StatusIcon>
              <StatusIcon on={!!faultCode}>!</StatusIcon>
              <StatusIcon on={running}>↕</StatusIcon>
              <StatusIcon on={commOnline} round>△</StatusIcon>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: C.inkSoft }}>◀</span>
            </div>

            {/* 6 位辅显示 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3,
              paddingRight: 2 }}>
              <SevenSegment chars={auxChars} dotIndex={auxDotIndex} blinkIndex={null} aux />
              <span style={{ fontSize: 9, color: C.inkSoft }}>◀</span>
            </div>

            {/* 5 位主显示 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3,
              paddingRight: 2 }}>
              <SevenSegment chars={display.main} dotIndex={dotIndex} blinkIndex={display.blinkDigit} />
              <span style={{ fontSize: 9, color: C.inkSoft }}>◀</span>
            </div>

            {/* 单位灯丝印 + 方框指示灯 */}
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', justifyContent: 'space-between' }}>
              {MD520_UNITS.map((u) => (
                <span key={u} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <span style={{ fontSize: 8, color: u === display.unit ? C.ledOn : C.ink,
                    whiteSpace: 'nowrap', fontWeight: u === display.unit ? 700 : 400 }}>{u}</span>
                  <span style={{ width: 13, height: 4, border: `1px solid ${C.inkSoft}`,
                    background: u === display.unit ? C.ledOn : C.ledOff }} />
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 4 菜单指示灯 + 竖线分隔 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-evenly',
          height: 20, margin: '1px 0 2px' }}>
          {MD520_MENUS.map((m, i) => (
            <Fragment key={m}>
              {i > 0 && <span style={{ width: 1, height: 14, background: C.inkSoft, opacity: 0.55 }} />}
              <span title={MD520_MENU_LABELS[m]} style={{
                width: 26, height: 19, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
                color: i === menuIndex ? C.ledOn : C.inkSoft,
                border: `1px solid ${i === menuIndex ? C.ledOn : 'rgba(109,122,134,.45)'}`,
                borderRadius: 3,
                background: i === menuIndex ? 'rgba(223,67,43,.10)' : 'transparent',
              }}>{MENU_ICONS[m]}</span>
            </Fragment>
          ))}
        </div>

        {/* 按键区：真机布局，按键轮廓全部走 SVG path */}
        <div data-dt-vfd-keypad style={{ position: 'relative', height: 200 }}>

          {/* 导航环：真机没有外圈轮廓，四瓣按键自己围成圆环。
              四瓣的矩形包围盒在四个角完全分离（x 留 1px、y 留 2px），
              与中央 OK 圆之间留 3~5px 均匀间隙，形成真机的十字缝。 */}
          <div data-dt-vfd-nav style={{ position: 'absolute', left: '50%', top: 3, transform: 'translateX(-50%)',
            width: 140, height: 140, borderRadius: '50%' }}>
            <PanelKey label="UP" name="递增键" onPress={press} disabled={readOnly}
              shape="up" w={62} h={32}
              style={{ left: '50%', top: 4, transform: 'translateX(-50%)', fontSize: 13 }}>
              <span style={{ transform: 'translateY(-4px)' }}>△</span>
            </PanelKey>
            <PanelKey label="DOWN" name="递减键" onPress={press} disabled={readOnly}
              shape="down" w={62} h={32}
              style={{ left: '50%', bottom: 4, transform: 'translateX(-50%)', fontSize: 13 }}>
              <span style={{ transform: 'translateY(4px)' }}>▽</span>
            </PanelKey>
            <PanelKey label="LEFT" name="左移位键" onPress={press} disabled={readOnly}
              shape="left" w={34} h={64}
              style={{ left: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>
              <span style={{ transform: 'translateX(-4px)' }}>◀</span>
            </PanelKey>
            <PanelKey label="RIGHT" name="右移位键" onPress={press} disabled={readOnly}
              shape="right" w={34} h={64}
              style={{ right: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 12 }}>
              <span style={{ transform: 'translateX(4px)' }}>▶</span>
            </PanelKey>
            <PanelKey label="OK" name="确认键" onPress={press} disabled={readOnly}
              shape="ok" w={58} h={58}
              style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                borderRadius: '50%', fontSize: 12, zIndex: 2 }}>OK</PanelKey>
          </div>

          {/* 左右竖长键 */}
          <PanelKey label="PRG" name="编程/返回键" onPress={press} disabled={readOnly}
            shape="tall" w={36} h={80}
            style={{ left: 14, top: 4, fontSize: 18 }}>↩</PanelKey>
          <button type="button" aria-label="菜单键" title="菜单键" disabled={readOnly}
            data-dt-vfd-key-pressed={menuPressed && !readOnly ? 1 : 0}
            onPointerDown={menuDown} onPointerUp={menuUp} onPointerLeave={menuUp}
            onPointerCancel={menuUp} onBlur={menuUp} onClick={menuClick}
            style={{ ...KEY_BASE, right: 14, top: 4, width: 36, height: 80, fontSize: 18,
              transform: menuPressed && !readOnly ? KEY_PRESS_TRANSFORM.trim() : '',
              filter: menuPressed && !readOnly ? 'brightness(0.93)' : 'none',
              transition: KEY_TRANSITION, touchAction: 'none',
              opacity: readOnly ? 0.55 : 1, cursor: readOnly ? 'not-allowed' : 'pointer' }}>
            <KeyOutline shape="tall" w={36} h={80} pressed={menuPressed && !readOnly} />
            <span style={{ position: 'relative', zIndex: 1 }}>⌂</span>
          </button>

          {/* 左下 / 右下斜置运行键：真机倾角约 30° */}
          <PanelKey label="RUN" name="运行键" onPress={press} disabled={readOnly}
            shape="tilt" w={50} h={62}
            style={{ left: 28, bottom: 8, transform: 'rotate(-30deg)' }}>
            <span style={{ transform: 'rotate(30deg)', fontSize: 14 }}>◇</span>
          </PanelKey>
          <PanelKey label="STOP" name="停止键/故障复位" onPress={press} disabled={readOnly}
            shape="tilt" w={50} h={62}
            style={{ right: 28, bottom: 8, transform: 'rotate(30deg)' }}>
            <span style={{ transform: 'rotate(-30deg)', fontSize: 14 }}>⊗</span>
          </PanelKey>
          <PanelKey label="MFK" name="多功能选择键" onPress={press} disabled={readOnly}
            shape="mfk" w={62} h={26}
            style={{ left: '50%', bottom: 4, transform: 'translateX(-50%)', fontSize: 10 }}>MF. K</PanelKey>
        </div>

        {/* 教学信号区：DI / AI / 485 / DO，真机无此区 */}
        <div data-dt-vfd-signal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px',
          padding: 5, borderRadius: 8, background: C.signal, border: `1px solid ${C.signalEdge}` }}>
          {/* 跨列第 1 行：DI 端子 + 段速 */}
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            {MD520_DI.map((d) => (
              <button key={d.key} type="button" aria-label={d.key} title={d.label} disabled={readOnly}
                onClick={() => setDi(d.key, !di[d.key])}
                style={{ minWidth: 26, height: 18, fontSize: 9, fontWeight: 700, padding: '0 3px',
                  borderRadius: 3, cursor: readOnly ? 'not-allowed' : 'pointer',
                  color: di[d.key] ? '#fff' : C.ink,
                  background: di[d.key] ? C.ledOn : 'rgba(255,255,255,.55)',
                  border: `1px solid ${di[d.key] ? C.ledOn : C.keyEdge}`,
                  opacity: readOnly ? 0.55 : 1 }}>
                {d.key}
              </button>
            ))}
            <span data-dt-vfd-multi style={{ marginLeft: 'auto', fontSize: 9,
              fontFamily: 'monospace', color: C.ink }}>
              段{multiIndex} {Math.round(Math.abs(Number(params[`FC-0${multiIndex}`] ?? 0)) / 100 * (params['F0-10'] || 50))}Hz
            </span>
          </div>

          {/* 左列：AI 模拟量 */}
          <div style={{ display: 'grid', gridTemplateColumns: '18px 1fr 34px', gap: '2px 4px',
            alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: C.ink }}>AI1</span>
            <input data-dt-vfd-ai1 type="range" min={-10} max={10} step={0.1} value={ai1} disabled={readOnly}
              onChange={(e) => setAi1(Number(e.target.value))} style={{ width: '100%', height: 12 }} />
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.ink }}>{ai1.toFixed(1)}V</span>
            <span style={{ fontSize: 9, color: C.ink }}>AI2</span>
            <input data-dt-vfd-ai2 type="range" min={0} max={ai2Max} step={0.1} value={ai2} disabled={readOnly}
              onChange={(e) => setAi2(Number(e.target.value))} style={{ width: '100%', height: 12 }} />
            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.ink }}>{ai2.toFixed(1)}{ai2Unit}</span>
            <span />
            <button type="button" data-dt-vfd-ai2-mode disabled={readOnly}
              style={{ height: 17, fontSize: 9, padding: '0 4px', borderRadius: 3,
                background: 'rgba(255,255,255,.55)', color: C.ink, border: `1px solid ${C.keyEdge}`,
                cursor: readOnly ? 'not-allowed' : 'pointer', opacity: readOnly ? 0.55 : 1 }}
              onClick={() => setAi2Mode(ai2Mode === 'voltage' ? 'current' : 'voltage')}>
              {ai2Mode === 'voltage' ? '0~10V' : '0~20mA'}
            </button>
            <span />
          </div>

          {/* 右列：DO 只读状态，竖排对齐 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
            {MD520_DO.map((d) => (
              <span key={d.key} style={{ fontSize: 9, fontFamily: 'monospace',
                color: doFlags[d.key] ? C.ledOn : C.inkSoft,
                border: `1px solid ${C.signalEdge}`, borderRadius: 3, padding: '0 3px' }}>
                {d.key} {doFlags[d.key] ? 'ON' : 'OFF'}
              </span>
            ))}
          </div>

          {/* 跨列第 3 行：485 只读状态 + 闪烁位丝印 */}
          <div data-dt-vfd-rs485 data-dt-vfd-plc={plcDiFlags} style={{ gridColumn: 'span 2', display: 'flex', gap: 5,
            flexWrap: 'wrap', fontSize: 9, fontFamily: 'monospace', color: C.inkSoft,
            borderTop: `1px solid ${C.signalEdge}`, paddingTop: 3 }}>
            <span>485</span>
            <span>站{params['FD-02']}</span>
            <span>FD-00 {params['FD-00']}</span>
            <span>2000H 命令 {command}</span>
            <span>1008H DI {plcDiFlags}</span>
            <span>100AH {ai1.toFixed(2)}V</span>
            <span>PLC {commOnline ? '在线' : '离线'}</span>
            <span>3000H 状态 {status}</span>
            <span>1000H {((externalSetpointHz / (params['F0-10'] || 50)) * 10000).toFixed(0)}</span>
            <span>{MD520_COMM.FREQ2.toString(16).toUpperCase()}H {externalSetpointHz.toFixed(2)}Hz</span>
            <span style={{ color: C.ink }}>
              {message || (display.blinkDigit !== null ? `位 ${display.blinkDigit + 1}` : `L${keypad.level}`)}
            </span>
            <span style={{ marginLeft: 'auto' }}>
              {current ? `${current.code} ${current.name}` : `设定 ${Number(params['F0-08']).toFixed(2)}`}
              {' · '}输出 {outputHz.toFixed(2)} Hz
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
