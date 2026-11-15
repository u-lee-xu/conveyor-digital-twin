import { lazy, Suspense, useEffect, useState } from 'react';
import { isTeacherRuntime } from '@digital-twin/shared/runtime/runtimeRole';
import { LauncherPage } from './LauncherPage';
import { DEVICE_META } from './deviceMeta';

/**
 * 工作区按需加载：启动器首屏只带轻量元数据，进入设备 / 成为观众时才拉起
 * 设备注册表、7 个设备实现与 Three / Rapier 所在的 chunk。
 */
const TeacherWorkspace = lazy(() => import('./TeacherWorkspace').then((m) => ({ default: m.TeacherWorkspace })));
const ViewerWorkspace = lazy(() => import('./ViewerWorkspace').then((m) => ({ default: m.ViewerWorkspace })));

type Screen =
  | { role: 'teacher'; deviceId: string | null }
  | { role: 'viewer' };

/**
 * 软件运行模式（2026-11-08 定稿）：
 *  - 装了软件的机器（Electron file:// / localhost / 127.0.0.1）打开就是主控，
 *    直接进设备选择，不再显示角色选择页。
 *  - 其余设备通过 http://<教师机IP>:5201/ 打开就直接是只读跟随的观众，
 *    不需要参数或点击任何按钮，智能电视遥控器也能用。
 */
function initialScreen(): Screen {
  return isTeacherRuntime() ? { role: 'teacher', deviceId: null } : { role: 'viewer' };
}

function encodeScreen(s: Screen): string {
  if (s.role === 'viewer') return 'viewer';
  return s.deviceId ? `teacher:${s.deviceId}` : 'teacher';
}

function decodeScreen(st: unknown, fallback: Screen): Screen {
  if (st === 'viewer') return { role: 'viewer' };
  if (typeof st === 'string' && st.startsWith('teacher:')) {
    return { role: 'teacher', deviceId: st.slice('teacher:'.length) };
  }
  if (st === 'teacher') return { role: 'teacher', deviceId: null };
  return fallback;
}

/** 页面加载时判定一次角色，之后不再随渲染变化（避免 ref 在 render 期读取） */
const INITIAL_SCREEN: Screen = initialScreen();

function LoadingScreen() {
  return (
    <div
      data-dt-workspace-loading="1"
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', gap: 16,
        alignItems: 'center', justifyContent: 'center', background: '#0b1220',
        color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ width: 32, height: 32, border: '2px solid #334155', borderTopColor: '#3b82f6', borderRadius: '50%' }} />
      <p style={{ fontSize: 14 }}>场景加载中…</p>
    </div>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>(INITIAL_SCREEN);

  // 浏览器返回 / Android 手势 → 回退到上一屏；兜底不回到角色选择页
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setScreen(decodeScreen(e.state, INITIAL_SCREEN));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: Screen) => {
    history.pushState(encodeScreen(next), '');
    setScreen(next);
  };

  /**
   * 「返回设备选择」一次点击必达。
   * 旧实现用 history.back() + popstate 解码决定去向：会话恢复后 history.state 可能
   * 仍残留 'teacher:<id>'，或栈里连续多条设备记录，此时 back() 只退一格会落到另一条
   * 设备记录上，画面看起来「没反应」，要点几次才回到首页。
   * 现在同步 setScreen 回首页，并用 replaceState 把当前记录改写成首页状态，
   * 保证刷新后仍停在设备选择页；浏览器 / Android 的后退手势仍由 popstate 处理。
   */
  const goBack = () => {
    const home: Screen = { role: 'teacher', deviceId: null };
    history.replaceState(encodeScreen(home), '');
    setScreen(home);
  };

  const selectDevice = (deviceId: string) => navigate({ role: 'teacher', deviceId });

  // 观众：无软件设备打开链接即进入，零交互
  if (screen.role === 'viewer') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <ViewerWorkspace />
      </Suspense>
    );
  }

  // 主控：选设备 → 工作区
  if (screen.deviceId === null) {
    return <LauncherPage devices={DEVICE_META} onSelect={selectDevice} />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <TeacherWorkspace key={screen.deviceId} deviceId={screen.deviceId} onBack={goBack} />
    </Suspense>
  );
}
