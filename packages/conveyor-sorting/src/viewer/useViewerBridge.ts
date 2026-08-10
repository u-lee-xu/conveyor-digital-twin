import { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../stores';

interface Snapshot {
  ts: number;
  connected: boolean;
  protocol: string;
  vars: Record<string, boolean>;
  error?: string;
}

export type BridgeLink = 'connecting' | 'online' | 'offline';

/** 把广播快照（PLC 变量名→布尔）映射写入 useDeviceStore，驱动 3D 场景（只读镜像） */
export function applySnapshot(snap: Snapshot): void {
  const s = useDeviceStore.getState();
  const v = snap.vars;

  const conveyor = !!v['CONVEYOR'];
  if (conveyor !== s.conveyorRunning) {
    if (conveyor) s.startConveyor(); else s.stopConveyor();
  }

  const syncCylinder = (name: 'feed' | 'sorting1' | 'sorting2', valveKey: string) => {
    const valve = !!v[valveKey];
    if (valve !== s.cylinders[name].extended) {
      if (valve) s.extendCylinder(name); else s.retractCylinder(name);
    }
  };
  syncCylinder('feed', 'FEED_CYLINDER_VALVE');
  syncCylinder('sorting1', 'SORTING1_CYLINDER_VALVE');
  syncCylinder('sorting2', 'SORTING2_CYLINDER_VALVE');

  s.setSensor('feed', !!v['SENSOR_FEED']);
  s.setSensor('color', !!v['SENSOR_COLOR']);
  s.setSensor('material', !!v['SENSOR_MATERIAL']);

  s.setSignalTower({
    red: !!v['SIGNAL_TOWER_RED'],
    green: !!v['SIGNAL_TOWER_GREEN'],
    yellow: !!v['SIGNAL_TOWER_YELLOW'],
  });
}

/** 订阅树莓派状态广播（8082），快照驱动 store，断线自动重连 */
export function useViewerBridge(): { link: BridgeLink; snapshot: Snapshot | null } {
  const [link, setLink] = useState<BridgeLink>('connecting');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const host = typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
    let closed = false;

    const connect = () => {
      const ws = new WebSocket(`ws://${host}:8082`);
      wsRef.current = ws;
      setLink('connecting');

      ws.onopen = () => setLink('online');
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== 'snapshot') return;
          setSnapshot(msg);
          applySnapshot(msg);
        } catch {
          // 忽略非法消息
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setLink('offline');
        setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, []);

  return { link, snapshot };
}
