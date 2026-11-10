import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier';
import { DoubleSide, type Group, type MeshStandardMaterial } from 'three';
import { geometries, materials } from '../../../components/scene/shared';
import { type CylinderName } from '../../../types/device';
import {
  CYLINDER_RETRACT_POS, CYLINDER_EXTEND_POS_FEED, CYLINDER_EXTEND_POS_SORT,
  VISUAL, COMPONENT, CYLINDER_DETAIL, SURFACE_GAP,
} from '../constants';
import { readCylinderExtensions } from '../cylinderKinematics';
import { getPushPlateCenterZ } from './helpers';

const COLLIDERS_ONLY = false;
const D = CYLINDER_DETAIL;
const C = COMPONENT;

function DebugBox({ args, color = '#22c55e', opacity = 0.25 }: {
  args: [number, number, number]; color?: string; opacity?: number;
}) {
  if (!COLLIDERS_ONLY) return null;
  return (
    <mesh>
      <boxGeometry args={[args[0] * 2, args[1] * 2, args[2] * 2]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} />
    </mesh>
  );
}

/** 缸体拟真细节：四角拉杆、侧向 T 槽贴片、端盖螺栓 */
function CylinderDetail() {
  const corners: [number, number][] = [
    [-D.TIE_ROD_XZ, -D.TIE_ROD_XZ], [-D.TIE_ROD_XZ, D.TIE_ROD_XZ],
    [D.TIE_ROD_XZ, -D.TIE_ROD_XZ], [D.TIE_ROD_XZ, D.TIE_ROD_XZ],
  ];
  const endY = C.CYLINDER_BODY_HALF_LEN + 0.035 + SURFACE_GAP;
  return (
    <group>
      {corners.map(([x, z]) => (
        <mesh key={`rod-${x}-${z}`} position={[x, 0, z]} material={materials.brightSilver}>
          <cylinderGeometry args={[D.TIE_ROD_R, D.TIE_ROD_R, D.TIE_ROD_LEN, 8]} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={`slot-${side}`}
          position={[side * (C.CYLINDER_BODY_HALF_XZ + SURFACE_GAP), 0, 0]}
          material={materials.profileSlot}
        >
          <boxGeometry args={[D.SLOT_T, C.CYLINDER_BODY_HALF_LEN * 1.5, D.SLOT_W]} />
        </mesh>
      ))}
      {[-1, 1].map((end) => corners.map(([x, z]) => (
        <mesh
          key={`bolt-${end}-${x}-${z}`}
          position={[x, end * endY, z]}
          material={materials.decal}
        >
          <cylinderGeometry args={[D.BOLT_R, D.BOLT_R, D.BOLT_T, 8]} />
        </mesh>
      )))}
    </group>
  );
}

/** 双导杆：固定在推板上、穿过缸体端盖导向套，防止推板转动 */
function GuideRods() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * D.GUIDE_ROD_X, C.CYLINDER_ROD_LEN - D.GUIDE_ROD_LEN / 2, 0]}
          material={materials.brightSilver}
        >
          <cylinderGeometry args={[D.GUIDE_ROD_R, D.GUIDE_ROD_R, D.GUIDE_ROD_LEN, 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** 端盖上的导向套凸台：让「带导杆」在展台里一眼可辨 */
function GuideBushings() {
  const y = C.CYLINDER_BODY_HALF_LEN + 0.035 + D.GUIDE_BUSHING_LEN / 2;
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={geometries.guideBushing}
          material={materials.endCap}
          position={[side * D.GUIDE_ROD_X, y, 0]}
        />
      ))}
    </group>
  );
}

/**
 * 部件展台专用展示底座：整机靠 MountBracket 固定在输送线侧梁上，
 * 展台没有侧梁，用这块 1:1 托板把缸体垫实，避免整个气缸悬在网格上方。
 * 只读视觉，不写 store / 不碰 PLC；整机恒不传 previewMount。
 */
function PreviewStand() {
  return (
    <group position={[0, D.STAND_Y, 0]}>
      <mesh geometry={geometries.standPlate} material={materials.base} />
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={geometries.standPillar}
          material={materials.darkMetal}
          position={[0, D.STAND_T / 2 + D.STAND_PILLAR_H / 2, side * D.STAND_PILLAR_Z]}
        />
      ))}
    </group>
  );
}

/**
 * 安装支座：把悬空的气缸固定到输送线 +Z 侧梁上。
 * 用世界坐标（不套气缸的旋转 group），长度按该气缸实际 Z 位置推导，
 * 上料气缸（z=1.2）比分拣气缸（z=0.8）自然长出一段。
 */
function MountBracket({ cylinderX, cylinderZ }: { cylinderX: number; cylinderZ: number }) {
  const z0 = D.MOUNT_Z0;
  const z1 = cylinderZ - 0.10;
  const len = z1 - z0;
  if (len <= 0) return null;
  return (
    <group position={[cylinderX, D.MOUNT_Y, (z0 + z1) / 2]}>
      <mesh material={materials.base}>
        <boxGeometry args={[0.24, D.MOUNT_T, len]} />
      </mesh>
      <mesh position={[0, 0.085, len / 2 - 0.03]} material={materials.darkMetal}>
        <boxGeometry args={[0.20, 0.17, 0.03]} />
      </mesh>
      <mesh position={[0, D.MOUNT_T / 2 + SURFACE_GAP, 0]} material={materials.profileSlot}>
        <boxGeometry args={[0.10, SURFACE_GAP, len - 0.06]} />
      </mesh>
    </group>
  );
}

export function PhysicsCylinder({ name, position, previewExtension, previewMount }: {
  name: CylinderName;
  position: [number, number, number];
  /** 部件展台专用：固定展示行程（只读视觉，不写 store / 不碰 PLC），整机恒传 undefined */
  previewExtension?: number;
  /** 部件展台专用：垫实缸体的展示底座，整机用 MountBracket，恒不传 */
  previewMount?: boolean;
}) {
  const rodRef = useRef<Group>(null);
  const pushPlateRef = useRef<RapierRigidBody>(null);
  const isFeed = name === 'feed';
  const targetExtend = isFeed ? CYLINDER_EXTEND_POS_FEED : CYLINDER_EXTEND_POS_SORT;

  // 每实例创建一次 LED 材质（useFrame 中可变修改，不能共享单例），卸载时释放
  const ledMats = useMemo(() => {
    const base = materials.ledInactive;
    return [base.clone(), base.clone()];
  }, []);

  useEffect(() => {
    return () => ledMats.forEach((m) => m.dispose());
  }, [ledMats]);

  /** 磁性开关 LED：亮态绿、灭态暗玻璃（改材质实例，两侧灯珠同步变色） */
  const paintLed = (mat: MeshStandardMaterial, on: boolean) => {
    if (on) {
      mat.color.set(VISUAL.LAMP_GREEN);
      mat.emissive.set(VISUAL.LAMP_GREEN);
      mat.emissiveIntensity = VISUAL.LED_EMISSIVE_INTENSITY;
    } else {
      mat.color.set(VISUAL.LAMP_DARK);
      mat.emissive.set('#000000');
      mat.emissiveIntensity = 0;
    }
  };

  /**
   * 只读共享快照：视觉推杆、推板刚体与 PhysicsMaterial 里的工件
   * 在同一帧使用完全相同的 extension，推板不可能插进工件。
   */
  useFrame(() => {
    // 展台里用固定展示行程把整条推杆 / 推板链拉出来；整机仍只读共享快照
    const ext = previewExtension ?? readCylinderExtensions()[name];
    const plateZ = getPushPlateCenterZ(position[2], ext);

    if (rodRef.current) rodRef.current.position.y = ext;
    if (pushPlateRef.current) {
      pushPlateRef.current.setNextKinematicTranslation({
        x: position[0], y: position[1], z: plateZ,
      });
    }

    paintLed(ledMats[0], ext >= targetExtend - 0.04);
    paintLed(ledMats[1], ext <= CYLINDER_RETRACT_POS + 0.04);
  });

  return (
    <>
      <RigidBody
        ref={pushPlateRef}
        type="kinematicPosition"
        colliders={false}
        position={[position[0], position[1], getPushPlateCenterZ(position[2], CYLINDER_RETRACT_POS)]}
      >
        <CuboidCollider args={[...C.CYLINDER_PUSH_PLATE_HALF]} />
        <DebugBox args={[...C.CYLINDER_PUSH_PLATE_HALF]} color="#f97316" opacity={0.4} />
      </RigidBody>

      <group position={position} rotation={[Math.PI / 2, 0, Math.PI]}>
        <group visible={!COLLIDERS_ONLY}>
          <mesh geometry={geometries.cylinderBody} material={materials.cylinderBody} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, -C.CYLINDER_BODY_HALF_LEN, 0]} />
          <mesh geometry={geometries.cylinderEndCap} material={materials.endCap} position={[0, C.CYLINDER_BODY_HALF_LEN, 0]} />
          <CylinderDetail />
          <GuideBushings />

          {/* 黄铜气接头 + 黑色节流调节头 */}
          {[
            { y: C.CYLINDER_BODY_HALF_LEN - 0.05, key: 'valve-top' },
            { y: -C.CYLINDER_BODY_HALF_LEN + 0.05, key: 'valve-bottom' },
          ].map(({ y, key }) => (
            <group key={key} position={[0.1, y, 0]}>
              <mesh geometry={geometries.valveBody} material={materials.brass} />
              <mesh geometry={geometries.tubeConnector} material={materials.brass} position={[0.04, 0, 0]} rotation={[0, 0, Math.PI / 2]} />
              <mesh geometry={geometries.valveCap} material={materials.darkMetal} position={[0, 0.04, 0]} />
            </group>
          ))}

          {/* 两只磁性开关嵌在侧面 T 槽里（伸出位 / 缩回位）：细长条 + 出线 + 小 LED。
              两侧各放一组，整机 -Z 机位与展台 +X 机位都能看到；LED 共用材质实例同步变色。 */}
          {[-1, 1].flatMap((side) => [
            { y: C.CYLINDER_BODY_HALF_LEN - 0.10, mat: ledMats[0], key: 'sw-ext' },
            { y: -C.CYLINDER_BODY_HALF_LEN + 0.10, mat: ledMats[1], key: 'sw-ret' },
          ].map(({ y, mat, key }) => {
            const x = side * (C.CYLINDER_BODY_HALF_XZ + D.SLOT_T + D.MAGSWITCH_T / 2 + SURFACE_GAP);
            return (
              <group key={`${side}-${key}`}>
                <mesh
                  geometry={geometries.magneticSwitch}
                  material={materials.magneticSwitch}
                  position={[x, y, 0]}
                />
                <mesh
                  geometry={geometries.led}
                  material={mat}
                  position={[x + side * (D.MAGSWITCH_T / 2 + SURFACE_GAP), y, 0]}
                />
                <mesh
                  geometry={geometries.magneticSwitchCable}
                  material={materials.darkMetal}
                  position={[x, y - D.MAGSWITCH_LEN / 2 - 0.024, 0]}
                />
              </group>
            );
          }))}

          <group ref={rodRef} position={[0, CYLINDER_RETRACT_POS, 0]}>
            {/* 中心活塞杆与两根导杆同为镀硬铬亮银，不再是一根抢眼的深色粗棒 */}
            <mesh geometry={geometries.cylinderRod} material={materials.brightSilver} position={[0, C.CYLINDER_ROD_LEN / 2, 0]} />
            <GuideRods />
            <mesh geometry={geometries.cylinderPushPlate} material={materials.endCap} position={[0, C.CYLINDER_ROD_LEN, 0]} />
            <mesh
              position={[0, C.CYLINDER_ROD_LEN + C.CYLINDER_PUSH_PLATE_HALF[2] + SURFACE_GAP, 0]}
              material={materials.decalDark}
            >
              <boxGeometry args={[
                C.CYLINDER_PUSH_PLATE_HALF[0] * 2 - 0.02,
                SURFACE_GAP,
                C.CYLINDER_PUSH_PLATE_HALF[1] * 2 - 0.02,
              ]} />
            </mesh>
            {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
              <mesh
                key={`plate-bolt-${sx}-${sz}`}
                geometry={geometries.plateBolt}
                material={materials.decal}
                position={[
                  sx * D.PLATE_BOLT_X,
                  C.CYLINDER_ROD_LEN + C.CYLINDER_PUSH_PLATE_HALF[2] + 2 * SURFACE_GAP,
                  sz * D.PLATE_BOLT_Z,
                ]}
              />
            )))}
            <mesh
              geometry={geometries.plateBumper}
              material={materials.rubberBumper}
              position={[
                0,
                C.CYLINDER_ROD_LEN + C.CYLINDER_PUSH_PLATE_HALF[2] + 3 * SURFACE_GAP,
                0,
              ]}
            />
          </group>
        </group>
      </group>

      {!COLLIDERS_ONLY && <MountBracket cylinderX={position[0]} cylinderZ={position[2]} />}
      {previewMount && !COLLIDERS_ONLY && <PreviewStand />}
    </>
  );
}
