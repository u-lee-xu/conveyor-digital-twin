import { useState } from 'react';
import { RoleSelectPage } from './RoleSelectPage';
import { LauncherPage } from './LauncherPage';
import { WorkspaceShell } from './WorkspaceShell';
import { ViewerWorkspace } from './ViewerWorkspace';
import { devices, getDevice } from './registry';

type Screen =
  | { role: 'select' }
  | { role: 'teacher'; deviceId: string | null }
  | { role: 'viewer' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ role: 'select' });

  if (screen.role === 'select') {
    return (
      <RoleSelectPage
        onSelect={(role) => setScreen(role === 'teacher' ? { role: 'teacher', deviceId: null } : { role: 'viewer' })}
      />
    );
  }

  if (screen.role === 'viewer') {
    return <ViewerWorkspace />;
  }

  // 主控：选设备 → 工作区
  if (screen.deviceId === null) {
    return <LauncherPage devices={devices} onSelect={(deviceId) => setScreen({ role: 'teacher', deviceId })} />;
  }

  const device = getDevice(screen.deviceId);
  if (!device) {
    return <LauncherPage devices={devices} onSelect={(deviceId) => setScreen({ role: 'teacher', deviceId })} />;
  }

  return (
    <WorkspaceShell
      key={device.id}
      device={device}
      onBack={() => setScreen({ role: 'teacher', deviceId: null })}
    />
  );
}
