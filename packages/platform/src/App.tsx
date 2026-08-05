import { useState } from 'react';
import { LauncherPage } from './LauncherPage';
import { WorkspaceShell } from './WorkspaceShell';
import { devices, getDevice } from './registry';

export function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  if (deviceId === null) {
    return <LauncherPage devices={devices} onSelect={setDeviceId} />;
  }

  const device = getDevice(deviceId);
  if (!device) {
    return <LauncherPage devices={devices} onSelect={setDeviceId} />;
  }

  return (
    <WorkspaceShell
      key={device.id}
      device={device}
      onBack={() => setDeviceId(null)}
    />
  );
}
