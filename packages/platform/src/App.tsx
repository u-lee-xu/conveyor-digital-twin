import { useEffect, useState } from 'react';
import { RoleSelectPage } from './RoleSelectPage';
import { LauncherPage } from './LauncherPage';
import { WorkspaceShell } from './WorkspaceShell';
import { ViewerWorkspace } from './ViewerWorkspace';
import { devices, getDevice } from './registry';

type Screen =
  | { role: 'select' }
  | { role: 'teacher'; deviceId: string | null }
  | { role: 'viewer' };

/** screen → history state（select 不压栈） */
function encodeScreen(s: Screen): string | null {
  if (s.role === 'select') return null;
  if (s.role === 'viewer') return 'viewer';
  if (s.role === 'teacher' && s.deviceId) return `teacher:${s.deviceId}`;
  return 'teacher';
}

function decodeScreen(st: unknown): Screen {
  if (st === 'viewer') return { role: 'viewer' };
  if (typeof st === 'string' && st.startsWith('teacher:')) {
    return { role: 'teacher', deviceId: st.slice('teacher:'.length) };
  }
  if (st === 'teacher') return { role: 'teacher', deviceId: null };
  return { role: 'select' };
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ role: 'select' });

  // 浏览器返回 / Android 手势 / 页面内返回按钮 → 回退到上一屏
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      setScreen(decodeScreen(e.state));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: Screen) => {
    history.pushState(encodeScreen(next), '');
    setScreen(next);
  };

  const goBack = () => {
    if (history.state !== null) {
      history.back();
    } else {
      setScreen({ role: 'select' });
    }
  };

  if (screen.role === 'select') {
    return (
      <RoleSelectPage
        onSelect={(role) => navigate(role === 'teacher' ? { role: 'teacher', deviceId: null } : { role: 'viewer' })}
      />
    );
  }

  if (screen.role === 'viewer') {
    return <ViewerWorkspace onBack={goBack} />;
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
