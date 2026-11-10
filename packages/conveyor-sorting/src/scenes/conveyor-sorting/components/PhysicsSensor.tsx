import { useMemo } from 'react';
import { useDeviceStore } from '../../../stores';
import { geometries, materials } from '../../../components/scene/shared';
import { COMPONENT, SENSOR_DETAIL, SURFACE_GAP } from '../constants';

const COLLIDERS_ONLY = false;
const S = SENSOR_DETAIL;
const C = COMPONENT;

/**
 * 上料 / 物料 = 同型号漫反射光电开关（有无检测）；
 * 色标 = 独立的颜色传感器（黑 ON / 蓝 OFF），机身、光窗、示教键都不同。
 * 三只共用安装支架、检测态灯与类型色标；尺寸只来自 SENSOR_DETAIL / COMPONENT，
 * 颜色只来自 VISUAL，几何只来自 geometries.ts —— 改一处整机与展台同步生效。
 */

/** 共用安装件：立杆 + 底板 + 黄铜出线接头（背面 Z 按机型给，避免接头陷进厚机身） */
function SensorStand({ backZ }: { backZ: number }) {
  return (
    <group>
      <mesh
        geometry={geometries.sensorBracket}
        material={materials.sensorBracket}
        position={[0, -S.BRACKET_H / 2, 0]}
      />
      <mesh
        geometry={geometries.sensorBase}
        material={materials.base}
        position={[0, -S.BRACKET_H - S.BASE_T / 2 - SURFACE_GAP, 0]}
      />
      <mesh
        geometry={geometries.sensorCable}
        material={materials.brass}
        position={[0, -0.006, backZ - 0.006]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

/** 检测态灯：壳体顶面的小灯珠 + 可选柔光圈，任意斜俯视机位都可见 */
function DetectionLed({ active }: { active: boolean }) {
  return (
    <group>
      {active && (
        <mesh
          position={[0, C.SENSOR_BULB_OFFSET_Y - 0.004, C.SENSOR_BULB_OFFSET_Z]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={materials.sensorHalo}
        >
          <ringGeometry args={[C.SENSOR_HALO_INNER, C.SENSOR_HALO_OUTER, 20]} />
        </mesh>
      )}
      <mesh
        geometry={geometries.sensorBulb}
        material={active ? materials.sensorDetected : materials.lampDark}
        position={[0, C.SENSOR_BULB_OFFSET_Y, C.SENSOR_BULB_OFFSET_Z]}
        scale={C.SENSOR_BULB_SCALE}
      />
    </group>
  );
}

/** 背面状态条：机位翻到 -Z 侧时仍能看出有没有检测到，Z 按机身厚度给 */
function BackPanel({ active, backZ }: { active: boolean; backZ: number }) {
  return (
    <mesh
      geometry={geometries.sensorPanel}
      material={active ? materials.sensorPanelGlow : materials.decalDark}
      position={[0, S.BODY_Y, backZ - SURFACE_GAP]}
    />
  );
}

/** 漫反射光电开关：双圆投/受光透镜 + 灵敏度旋钮 + 正面状态灯 */
function DiffusePhotoEye({ active }: { active: boolean }) {
  const faceZ = S.FRONT_Z + SURFACE_GAP;
  return (
    <group>
      <mesh geometry={geometries.sensor} material={materials.sensor} position={[0, S.BODY_Y, 0]} />
      <mesh
        geometry={geometries.sensorPanel}
        material={materials.decalDark}
        position={[0, S.BODY_Y, faceZ]}
      />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={geometries.sensorLens}
          material={materials.sensorOptics}
          position={[side * S.LENS_X, S.BODY_Y, faceZ + SURFACE_GAP]}
        />
      ))}
      <mesh
        geometry={geometries.sensorTrimmer}
        material={materials.rubberBumper}
        position={[S.BODY_W / 2 + SURFACE_GAP, S.BODY_Y - 0.012, 0.016]}
        rotation={[0, 0, Math.PI / 2]}
      />
      <mesh
        geometry={geometries.sensorStatus}
        material={active ? materials.sensorDetected : materials.lampDark}
        position={[S.BODY_W / 2 - 0.009, S.BODY_Y + 0.020, faceZ + SURFACE_GAP]}
      />
      <BackPanel active={active} backZ={S.BACK_Z} />
    </group>
  );
}

/** 色标传感器：宽矩形投受光窗 + 可见光斑 + 示教键 + 双色指示条 + 数值显示 */
function ColorMarkSensor({ active }: { active: boolean }) {
  const faceZ = S.COLOR_FRONT_Z + SURFACE_GAP;
  const sideX = S.COLOR_BODY_W / 2 + SURFACE_GAP;
  return (
    <group>
      <mesh
        geometry={geometries.sensorColorBody}
        material={materials.sensor}
        position={[0, S.BODY_Y, 0]}
      />
      <mesh
        geometry={geometries.sensorWindow}
        material={materials.sensorOptics}
        position={[0, S.BODY_Y, faceZ]}
      />
      <mesh
        geometry={geometries.sensorSpot}
        material={materials.sensorBeam}
        position={[0, S.BODY_Y, faceZ + SURFACE_GAP]}
      />
      <mesh
        geometry={geometries.sensorTeach}
        material={materials.rubberBumper}
        position={[sideX, S.BODY_Y + 0.018, 0.018]}
      />
      <mesh
        geometry={geometries.sensorBar}
        material={active ? materials.sensorPanelGlow : materials.lampDark}
        position={[sideX, S.BODY_Y - 0.018, 0.018]}
      />
      <mesh
        geometry={geometries.sensorDisplay}
        material={materials.sensorBeam}
        position={[0, S.BODY_Y + S.COLOR_BODY_H / 2 + SURFACE_GAP, 0.022]}
      />
      <BackPanel active={active} backZ={-S.COLOR_BODY_D / 2} />
    </group>
  );
}

export function PhysicsSensor({ name, position }: { name: string; position: [number, number, number] }) {
  const active = !!useDeviceStore((s) => s.sensors[name as keyof typeof s.sensors]);
  const isColor = name === 'color';
  // 色标机身更厚，出线 / 状态条 / 类型色标都要以该机型的背面为准
  const backZ = isColor ? -S.COLOR_BODY_D / 2 : S.BACK_Z;

  const labelMaterial = useMemo(() => {
    if (name === 'color') return materials.sensorLabelColor;
    if (name === 'material') return materials.sensorLabelMaterial;
    return materials.sensorLabelFeed;
  }, [name]);

  return (
    <group position={position}>
      <group visible={!COLLIDERS_ONLY}>
        <SensorStand backZ={backZ} />
        {isColor ? <ColorMarkSensor active={active} /> : <DiffusePhotoEye active={active} />}
        <DetectionLed active={active} />
        <mesh
          geometry={geometries.sensorLabel}
          material={labelMaterial}
          position={[0, S.BODY_Y, backZ - S.LABEL_D / 2 - SURFACE_GAP]}
        />
      </group>
    </group>
  );
}
