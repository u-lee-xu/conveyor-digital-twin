import { useEffect, useState } from 'react';
import { isTeacherRuntime } from '@digital-twin/shared';
import { LauncherPage } from './LauncherPage';
import { WorkspaceShell } from './WorkspaceShell';
import { ViewerWorkspace } from './ViewerWorkspace';
import { devices, getDevice } from './registry';

type Screen =
  | { role: 'teacher'; deviceId: string | null }
  | { role: 'viewer' };

/**
 * 软件运行模式（2026-11-08 定稿）：
 *  - 装了软件的机器（Electron file:// / localhost / 127.0.0.1）打开就是主控，
 *    直接进设备选择，不再显示角色选择页。
 *  - 其余设备通过 http://<教师机IP>:5201/ 打开就直接是只读跟随的观众，
 *    不需要参数、不需要点任何按钮（智能电视遥控器也能用）。
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

  const goBack = () => {
    if (history.state !== null) history.back();
    else setScreen(INITIAL_SCREEN);
  };

  // 观众：无软件设备打开链接即进入，零交互
  if (screen.role === 'viewer') {
    return <ViewerWorkspace />;
  }

  // 主控：选设备 → 工作区
  if (screen.deviceId === null) {
    return <LauncherPage devices={devices} onSelect={(deviceId) => navigate({ role: 'teacher', deviceId })} />;
  }

  const device = getDevice(screen.deviceId);
  if (!device) {
    return <LauncherPage devices={devices} onSelect={(deviceId) => navigate({ role: 'teacher', deviceId })} />;
  }

  return (
    <WorkspaceShell
      key={device.id}
      device={device}
      onBack={goBack}
    />
  );
}
