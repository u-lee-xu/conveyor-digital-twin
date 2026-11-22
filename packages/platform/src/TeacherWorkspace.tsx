/**
 * 主控工作区（按需加载）：只下载当前选中的那一个设备实现，
 * 不再一次拉起全部设备与它们的 3D / 物理依赖。
 */
import { useEffect, useState } from 'react';
import { getDevice, loadDevice } from './registry';
import { WorkspaceShell } from './WorkspaceShell';
import type { DeviceDefinition } from './types';

function Placeholder({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <div
      data-dt-device-loading="1"
      style={{
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', gap: 12,
        alignItems: 'center', justifyContent: 'center', background: '#0b1220',
        color: '#e2e8f0', fontFamily: 'system-ui, sans-serif',
      }}
    >
      <p>{text}</p>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #475569', background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}
        >返回设备列表</button>
      )}
    </div>
  );
}

export function TeacherWorkspace({ deviceId, onBack }: { deviceId: string; onBack: () => void }) {
  const [device, setDevice] = useState<DeviceDefinition | null>(() => getDevice(deviceId) ?? null);
  const [error, setError] = useState<string | null>(null);

  // 组件以 deviceId 为 key 重建，初始 state 已命中缓存；effect 里只做异步加载，
  // 避免在 effect 主体同步 setState 触发级联渲染
  useEffect(() => {
    let cancelled = false;
    if (getDevice(deviceId)) return () => { cancelled = true; };
    loadDevice(deviceId)
      .then((loadedDevice) => { if (!cancelled) setDevice(loadedDevice); })
      .catch((e) => { if (!cancelled) setError(String((e && e.message) || e)); });
    return () => { cancelled = true; };
  }, [deviceId]);

  if (error) return <Placeholder text={`设备加载失败：${error}`} onBack={onBack} />;
  if (!device) return <Placeholder text="场景加载中…" onBack={onBack} />;
  return <WorkspaceShell key={device.id} device={device} onBack={onBack} />;
}
