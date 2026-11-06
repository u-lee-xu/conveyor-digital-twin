import { useFrame } from '@react-three/fiber';
import { useDeviceStore } from '../../stores';
import {
  writeCylinderExtensions, cylinderTarget, stepExtension, type CylinderExtensions,
} from './cylinderKinematics';

const NAMES = ['feed', 'sorting1', 'sorting2'] as const;

/**
 * 每帧统一推进三个气缸的行程。
 * priority -1 让它排在所有消费者之前（R3F 的 useFrame 按 priority 升序执行，
 * 只有正数才接管渲染），配合 cylinderKinematics 的原地快照，
 * 保证视觉推杆 / 推板刚体 / 工件在同一帧读到同一组数值。
 */
export function CylinderMotionDriver() {
  const updateCylinderExtension = useDeviceStore((s) => s.updateCylinderExtension);

  useFrame((_, delta) => {
    const state = useDeviceStore.getState();
    const next: CylinderExtensions = {
      feed: stepExtension(
        state.cylinders.feed.currentExtension,
        cylinderTarget('feed', state.cylinders.feed.extended),
        delta,
      ),
      sorting1: stepExtension(
        state.cylinders.sorting1.currentExtension,
        cylinderTarget('sorting1', state.cylinders.sorting1.extended),
        delta,
      ),
      sorting2: stepExtension(
        state.cylinders.sorting2.currentExtension,
        cylinderTarget('sorting2', state.cylinders.sorting2.extended),
        delta,
      ),
    };

    writeCylinderExtensions(next);

    for (const name of NAMES) {
      if (Math.abs(state.cylinders[name].currentExtension - next[name]) > 0.000001) {
        updateCylinderExtension(name, next[name]);
      }
    }
  }, -1);

  return null;
}
