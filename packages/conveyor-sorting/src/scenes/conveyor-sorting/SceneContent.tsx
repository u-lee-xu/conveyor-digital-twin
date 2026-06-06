import { useDeviceStore } from '../../stores';
import {
  CYLINDER_POSITIONS, SENSOR_POSITIONS, MATERIAL_TABLE_POSITION,
  COMPONENT,
} from './constants';
import { PhysicsConveyorBelt } from './components/PhysicsConveyorBelt';
import { PhysicsSensor } from './components/PhysicsSensor';
import { PhysicsCylinder } from './components/PhysicsCylinder';
import { PhysicsMaterial } from './components/PhysicsMaterial';
import { PhysicsMaterialTable } from './components/PhysicsMaterialTable';
import { PhysicsSignalTower } from './components/PhysicsSignalTower';
import { PhysicsLabel } from './components/PhysicsLabel';

/**
 * 传送带分拣场景内容
 * 在 Physics 容器内渲染，包含所有场景特有的3D对象
 */
export function ConveyorSortingSceneContent() {
  const signalTower = useDeviceStore((s) => s.signalTower);

  return (
    <>
      <PhysicsConveyorBelt />
      <PhysicsMaterialTable position={MATERIAL_TABLE_POSITION} />
      <PhysicsLabel key="material-table" text="物料台" position={MATERIAL_TABLE_POSITION} offset={[0, 0.2, 0]} color="gray" />

      <PhysicsSensor name="feed" position={[...SENSOR_POSITIONS.feed]} />
      <PhysicsLabel key="feed-sensor" text="上料传感器" position={SENSOR_POSITIONS.feed} offset={[0, 0.2, 0]} color="green" />

      <PhysicsSensor name="color" position={[...SENSOR_POSITIONS.color]} />
      <PhysicsLabel key="color-sensor" text="色标传感器" position={SENSOR_POSITIONS.color} offset={[0, 0.2, 0]} color="orange" />

      <PhysicsSensor name="material" position={[...SENSOR_POSITIONS.material]} />
      <PhysicsLabel key="material-sensor" text="物料传感器" position={SENSOR_POSITIONS.material} offset={[0, 0.2, 0]} color="green" />

      <PhysicsCylinder name="feed" position={[...CYLINDER_POSITIONS.feed]} />
      <PhysicsLabel key="feed-cylinder" text="上料气缸" position={CYLINDER_POSITIONS.feed} offset={[0, 0.3, 0]} color="blue" />

      <PhysicsCylinder name="sorting1" position={[...CYLINDER_POSITIONS.sorting1]} />
      <PhysicsLabel key="sorting1-cylinder" text="分拣1" position={CYLINDER_POSITIONS.sorting1} offset={[0, 0.3, 0]} color="purple" />

      <PhysicsCylinder name="sorting2" position={[...CYLINDER_POSITIONS.sorting2]} />
      <PhysicsLabel key="sorting2-cylinder" text="分拣2" position={CYLINDER_POSITIONS.sorting2} offset={[0, 0.3, 0]} color="purple" />

      <PhysicsMaterial />
      <PhysicsSignalTower
        position={COMPONENT.TOWER_POSITION}
        red={signalTower.red}
        green={signalTower.green}
        yellow={signalTower.yellow}
      />
      <PhysicsLabel key="signal-tower" text="信号灯塔" position={COMPONENT.TOWER_POSITION} offset={[0, 1.1, 0]} color="yellow" />
    </>
  );
}
