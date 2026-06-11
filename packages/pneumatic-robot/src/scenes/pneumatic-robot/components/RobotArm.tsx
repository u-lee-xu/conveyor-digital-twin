import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRobotStore, type CylinderName } from '../useRobotStore';
import { COMPONENT, VISUAL, ANIMATION, STRUCT, rodTipLocalY } from '../constants';
import * as THREE from 'three';

// ========== 共享材质 ==========
const matPost = mkMat(VISUAL.FRAME_COLOR, 0.75, 0.25);
const matCantilever = mkMat(VISUAL.BEAM_COLOR, 0.7, 0.3);
const matBase = mkMat(VISUAL.BASE_COLOR, 0.6, 0.4);
const matCylBody = mkMat(VISUAL.CYLINDER_BODY_COLOR, 0.7, 0.3);
const matCylRod = mkMat(VISUAL.CYLINDER_ROD_COLOR, 0.9, 0.1);
const matEndCap = mkMat(VISUAL.CYLINDER_END_CAP_COLOR, 0.65, 0.35);
const matPlate = mkMat(VISUAL.MOUNT_PLATE_COLOR, 0.65, 0.35);
const matGripBody = mkMat(VISUAL.GRIPPER_BODY_COLOR, 0.6, 0.35);
const matGripFinger = mkMat(VISUAL.GRIPPER_FINGER_COLOR, 0.55, 0.4);
const matWorkpiece = mkMat(0xD4A574, 0.5, 0.5);
const matSensorOn = new THREE.MeshStandardMaterial({
  color: VISUAL.MAG_SENSOR_ON, emissive: VISUAL.MAG_SENSOR_ON, emissiveIntensity: 1.5,
});
const matSensorOff = new THREE.MeshStandardMaterial({ color: VISUAL.MAG_SENSOR_OFF });
// 指示灯材质缓存（模块级只创建一次）
const createIndicatorMat = (active: boolean, color: number) =>
  new THREE.MeshStandardMaterial({ color, emissive: active ? color : 0, emissiveIntensity: active ? 2 : 0 });
const indicatorMats = {
  running: {
    on: createIndicatorMat(true, VISUAL.INDICATOR_RUNNING),
    off: createIndicatorMat(false, VISUAL.INDICATOR_RUNNING),
  },
  home: {
    on: createIndicatorMat(true, VISUAL.INDICATOR_HOME),
    off: createIndicatorMat(false, VISUAL.INDICATOR_HOME),
  },
  processing: {
    on: createIndicatorMat(true, VISUAL.INDICATOR_PROCESSING),
    off: createIndicatorMat(false, VISUAL.INDICATOR_PROCESSING),
  },
  alarm: {
    on: createIndicatorMat(true, VISUAL.INDICATOR_ALARM),
    off: createIndicatorMat(false, VISUAL.INDICATOR_ALARM),
  },
};

function mkMat(color: number, metalness: number, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

const sensorGeo = new THREE.BoxGeometry(
  STRUCT.SENSOR_DISPLAY_SIZE, STRUCT.SENSOR_DISPLAY_SIZE, STRUCT.SENSOR_DISPLAY_SIZE,
);

// ========== 气缸单元（仅沿 Y 轴，无旋转） ==========
// 缸体中心在 local origin，推杆从 +Y 端伸出
function CylinderUnit({
  bodyRadius, bodyLength, strokeLength, rodRadius, position, extended, label,
}: {
  bodyRadius: number; bodyLength: number; strokeLength: number; rodRadius: number;
  position: number; extended: boolean; label: CylinderName;
}) {
  const sensors = useRobotStore((s) => s.cylinders[label]);
  const setMagSensor = useRobotStore((s) => s.setMagSensor);
  const halfBody = bodyLength / 2;

  useEffect(() => {
    const magFront = extended && position > 1 - ANIMATION.MAG_THRESHOLD;
    const magRear  = !extended && position < ANIMATION.MAG_THRESHOLD;
    if (magFront !== sensors.magFront || magRear !== sensors.magRear) {
      setMagSensor(label, magFront, magRear);
    }
  }, [position, extended, label, sensors.magFront, sensors.magRear, setMagSensor]);

  // 推杆内部位移
  const rodBaseY       = halfBody;                                          // 推杆组锚点：缸体顶端
  const rodTranslate   = position * strokeLength;                           // 推杆组平移量
  const frontCapEnd    = halfBody + STRUCT.CAP_GAP + STRUCT.END_CAP_THICKNESS;
  const tipRetracted   = frontCapEnd + STRUCT.ROD_TIP_PROTRUDE + STRUCT.ROD_TIP_HEAD_THICKNESS / 2;
  const tipOffset      = tipRetracted - halfBody;                           // 推杆末端头偏移(缩回时)
  const rodMeshLen     = strokeLength * 2;                                  // 推杆总长=2倍行程，缩回不戳出缸体
  const rodMeshCenter  = tipOffset - STRUCT.ROD_TIP_HEAD_THICKNESS / 2 - rodMeshLen / 2;

  const capR = bodyRadius * STRUCT.END_CAP_RADIUS_RATIO;
  const capT = STRUCT.END_CAP_THICKNESS;

  return (
    <group>
      {/* 缸体 */}
      <mesh material={matCylBody} castShadow>
        <cylinderGeometry args={[bodyRadius, bodyRadius, bodyLength, STRUCT.BODY_SEGMENTS]} />
      </mesh>
      {/* 后端盖 */}
      <mesh position={[0, -(halfBody + STRUCT.CAP_GAP), 0]} material={matEndCap} castShadow>
        <cylinderGeometry args={[capR, capR, capT, STRUCT.CAP_SEGMENTS]} />
      </mesh>
      {/* 前端盖 */}
      <mesh position={[0, halfBody + STRUCT.CAP_GAP, 0]} material={matEndCap} castShadow>
        <cylinderGeometry args={[capR, capR, capT, STRUCT.CAP_SEGMENTS]} />
      </mesh>

      {/* 推杆组 — 锚点在缸体顶端，随 position 外移 */}
      <group position={[0, rodBaseY, 0]}>
        <group position={[0, rodTranslate, 0]}>
          {/* 推杆 */}
          <mesh position={[0, rodMeshCenter, 0]} material={matCylRod} castShadow>
            <cylinderGeometry args={[rodRadius, rodRadius, rodMeshLen, STRUCT.ROD_SEGMENTS]} />
          </mesh>
          {/* 推杆末端连接头 */}
          <mesh position={[0, tipOffset, 0]} material={matEndCap} castShadow>
            <cylinderGeometry args={[
              rodRadius * STRUCT.ROD_TIP_HEAD_RADIUS_RATIO,
              rodRadius * STRUCT.ROD_TIP_HEAD_RADIUS_RATIO,
              STRUCT.ROD_TIP_HEAD_THICKNESS,
              STRUCT.CAP_SEGMENTS,
            ]} />
          </mesh>
        </group>
      </group>

      {/* 磁性开关 */}
      <mesh geometry={sensorGeo} material={sensors.magFront ? matSensorOn : matSensorOff}
        position={[bodyRadius + STRUCT.SENSOR_STANDOFF, halfBody - STRUCT.SENSOR_INSET, 0]} />
      <mesh geometry={sensorGeo} material={sensors.magRear ? matSensorOn : matSensorOff}
        position={[bodyRadius + STRUCT.SENSOR_STANDOFF, -(halfBody - STRUCT.SENSOR_INSET), 0]} />
    </group>
  );
}

// ========== 平行气动夹爪 ==========
// 结构：长方体本体 + 两指(L型：竖直爪+内弯夹持垫) + 本体前侧面磁性开关
function ParallelGripper({ openPosition }: { openPosition: number }) {
  const sensors = useRobotStore((s) => s.cylinders.clamp);
  const setMagSensor = useRobotStore((s) => s.setMagSensor);

  const [bx, by, bz] = COMPONENT.GRIPPER_BODY_SIZE;
  const jw = COMPONENT.GRIPPER_JAW_W;
  const jh = COMPONENT.GRIPPER_JAW_H;
  const jd = COMPONENT.GRIPPER_JAW_D;
  const pw = COMPONENT.GRIPPER_PAD_W;
  const ph = COMPONENT.GRIPPER_PAD_H;
  const travel = openPosition * COMPONENT.GRIPPER_OPEN_DISTANCE;

  // 手指竖直爪中心 Y（在本体底部下方）
  const jawY = -(by / 2) - jh / 2;
  // 夹持垫中心 Y（在竖直爪底部）
  const padY = jawY - jh / 2 - ph / 2;
  // 手指基准 X（闭合时位置，相对本体边缘内缩半个爪宽）
  const leftBaseX  = -(bx / 2 - jw / 2);
  const rightBaseX =  bx / 2 - jw / 2;
  // 滑块（本体底部，连接手指与本体，张开时保持部分在体内）
  const sliderLen = bx / 2 + COMPONENT.GRIPPER_OPEN_DISTANCE + 0.03; // 半体宽+行程+裕量
  const sliderH   = COMPONENT.GRIPPER_SLIDER_H;
  const sliderY   = -(by / 2) - sliderH / 2;

  // 磁性开关（本体前侧面 Z+，左右各一）
  const sensorZ = bz / 2 + STRUCT.SENSOR_STANDOFF;
  const sensorX = bx / 2 - 0.025;

  const magOpen  = openPosition > 1 - ANIMATION.MAG_THRESHOLD;
  const magClose = openPosition < ANIMATION.MAG_THRESHOLD;

  useEffect(() => {
    if (magOpen !== sensors.magFront || magClose !== sensors.magRear) {
      setMagSensor('clamp', magOpen, magClose);
    }
  }, [openPosition, magOpen, magClose, sensors.magFront, sensors.magRear, setMagSensor]);

  return (
    <group>
      {/* 本体 */}
      <mesh material={matGripBody} castShadow>
        <boxGeometry args={[bx, by, bz]} />
      </mesh>

      {/* 左手指 — 张开时向左(-X)移动 */}
      <group position={[leftBaseX - travel, 0, 0]}>
        {/* 滑块 — 向内(+X)伸入本体，始终部分留在本体内 */}
        <mesh position={[sliderLen / 2, sliderY, 0]} material={matGripFinger} castShadow>
          <boxGeometry args={[sliderLen, sliderH, jd]} />
        </mesh>
        {/* 竖直爪 */}
        <mesh position={[0, jawY, 0]} material={matGripFinger} castShadow>
          <boxGeometry args={[jw, jh, jd]} />
        </mesh>
        {/* 夹持垫（内弯，+X 方向伸向中心） */}
        <mesh position={[pw / 2, padY, 0]} material={matGripBody} castShadow>
          <boxGeometry args={[pw, ph, jd]} />
        </mesh>
      </group>

      {/* 右手指 — 张开时向右(+X)移动 */}
      <group position={[rightBaseX + travel, 0, 0]}>
        {/* 滑块 — 向内(-X)伸入本体，始终部分留在本体内 */}
        <mesh position={[-sliderLen / 2, sliderY, 0]} material={matGripFinger} castShadow>
          <boxGeometry args={[sliderLen, sliderH, jd]} />
        </mesh>
        <mesh position={[0, jawY, 0]} material={matGripFinger} castShadow>
          <boxGeometry args={[jw, jh, jd]} />
        </mesh>
        <mesh position={[-pw / 2, padY, 0]} material={matGripBody} castShadow>
          <boxGeometry args={[pw, ph, jd]} />
        </mesh>
      </group>

      {/* 磁性开关 — 本体前侧面，右→张开 左→夹紧 */}
      <mesh geometry={sensorGeo} material={magOpen ? matSensorOn : matSensorOff}
        position={[sensorX, 0, sensorZ]} />
      <mesh geometry={sensorGeo} material={magClose ? matSensorOn : matSensorOff}
        position={[-sensorX, 0, sensorZ]} />
    </group>
  );
}

// ========== 连接板 ==========
function MountPlate({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <mesh position={[x, y, z]} material={matPlate} castShadow>
      <boxGeometry args={COMPONENT.MOUNT_PLATE_SIZE} />
    </mesh>
  );
}

// ========== 单立柱机架 ==========
function RobotFrame({ indicators }: { indicators: { running: boolean; home: boolean; processing: boolean; alarm: boolean } }) {
  const [postW, postH] = COMPONENT.POST_SIZE;
  const [_baseW, baseH, baseD] = COMPONENT.BASE_SIZE;
  const [_cantW, cantH, cantL] = COMPONENT.CANTILEVER_SIZE;

  const postTopY = postH + baseH;
  const postCenterZ = -baseD / 4;
  const cantCenterZ = postCenterZ + cantL / 2;

  return (
    <group>
      {/* 底座 */}
      <mesh position={[0, baseH / 2, 0]} material={matBase} receiveShadow castShadow>
        <boxGeometry args={COMPONENT.BASE_SIZE} />
      </mesh>
      {/* 单立柱 */}
      <mesh position={[0, postH / 2 + baseH, postCenterZ]} material={matPost} castShadow>
        <boxGeometry args={COMPONENT.POST_SIZE} />
      </mesh>
      {/* 悬臂 */}
      <mesh position={[0, postTopY - cantH / 2, cantCenterZ]} material={matCantilever} castShadow>
        <boxGeometry args={COMPONENT.CANTILEVER_SIZE} />
      </mesh>
      {/* 指示灯 */}
      <group position={[postW / 2 + 0.03, postTopY - 0.15, postCenterZ]}>
        <mesh geometry={new THREE.CylinderGeometry(STRUCT.INDICATOR_RADIUS, STRUCT.INDICATOR_RADIUS, 0.02, 16)}
          material={indicatorMats.running[indicators.running ? 'on' : 'off']}
          position={[0, STRUCT.INDICATOR_SPACING * 1.5, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={new THREE.CylinderGeometry(STRUCT.INDICATOR_RADIUS, STRUCT.INDICATOR_RADIUS, 0.02, 16)}
          material={indicatorMats.home[indicators.home ? 'on' : 'off']}
          position={[0, STRUCT.INDICATOR_SPACING * 0.5, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={new THREE.CylinderGeometry(STRUCT.INDICATOR_RADIUS, STRUCT.INDICATOR_RADIUS, 0.02, 16)}
          material={indicatorMats.processing[indicators.processing ? 'on' : 'off']}
          position={[0, -STRUCT.INDICATOR_SPACING * 0.5, 0]} rotation={[0, 0, Math.PI / 2]} />
        <mesh geometry={new THREE.CylinderGeometry(STRUCT.INDICATOR_RADIUS, STRUCT.INDICATOR_RADIUS, 0.02, 16)}
          material={indicatorMats.alarm[indicators.alarm ? 'on' : 'off']}
          position={[0, -STRUCT.INDICATOR_SPACING * 1.5, 0]} rotation={[0, 0, Math.PI / 2]} />
      </group>
    </group>
  );
}

// ========== 主机械手 ==========
export function RobotArm() {
  const cylinders = useRobotStore((s) => s.cylinders);
  const setCylinderPosition = useRobotStore((s) => s.setCylinderPosition);
  const indicators = useRobotStore((s) => s.indicators);
  const workpiece = useRobotStore((s) => s.workpiece);
  const pickUpWorkpiece = useRobotStore((s) => s.pickUpWorkpiece);
  const releaseWorkpiece = useRobotStore((s) => s.releaseWorkpiece);
  const updateWorkpiece = useRobotStore((s) => s.updateWorkpiece);

  // 平滑动画
  useFrame((_, delta) => {
    const speed = ANIMATION.CYLINDER_SPEED * delta;
    for (const name of ['forward', 'lift', 'clamp'] as CylinderName[]) {
      const cyl = useRobotStore.getState().cylinders[name];
      const t = cyl.extended ? 1 : 0;
      if (Math.abs(cyl.position - t) > 0.001) {
        setCylinderPosition(name, cyl.position + Math.sign(t - cyl.position) * Math.min(speed, Math.abs(t - cyl.position)));
      }
    }

    // 更新工件重力
    if (!workpiece.held) {
      updateWorkpiece(delta);
    }
  });

  const fPos = cylinders.forward.position;
  const lPos = cylinders.lift.position;
  const cPos = cylinders.clamp.position;
  const fExt = cylinders.forward.extended;
  const lExt = cylinders.lift.extended;

  // ==================== 世界坐标计算 ====================
  // 坐标系：X=左右, Y=上下, Z=前后
  // 单立柱在底座后方(Z-)，悬臂向前(Z+)伸出
  // 前后气缸沿 Z 轴，升降气缸沿 Y 轴(朝下)

  const baseH  = COMPONENT.BASE_SIZE[1];
  const baseD  = COMPONENT.BASE_SIZE[2];
  const postH  = COMPONENT.POST_SIZE[1];
  const cantH  = COMPONENT.CANTILEVER_SIZE[1];
  const fBodyR = COMPONENT.FORWARD_CYLINDER_BODY_RADIUS;
  const fBodyL = COMPONENT.FORWARD_CYLINDER_BODY_LENGTH;
  const fStroke = COMPONENT.FORWARD_CYLINDER_STROKE;
  const lBodyR = COMPONENT.LIFT_CYLINDER_BODY_RADIUS;
  const lBodyL = COMPONENT.LIFT_CYLINDER_BODY_LENGTH;
  const lStroke = COMPONENT.LIFT_CYLINDER_STROKE;
  const plateThick = COMPONENT.MOUNT_PLATE_SIZE[1];

  // --- 前后气缸 ---
  // 缸体后端固定在悬臂起始端(Z-)，前端向前伸出(Z+)，轴线沿 Z（局部 Y → 旋转 π/2 → 世界 Z）
  const cantBottomY  = postH + baseH - cantH;
  const fwdWorldY    = cantBottomY - fBodyR - STRUCT.MOUNT_GAP;
  const cantStartZ   = -baseD / 4;          // 悬臂 Z 起点（后端）
  // 缸体中心 Z = 悬臂起点 + 半缸体长度 → 缸体后端对齐悬臂起点
  const fwdWorldZ    = cantStartZ + fBodyL / 2;
  // 缸体后端在 world 的 Z（用于放置连接支座）
  const fwdRearZ     = cantStartZ;

  // 前后推杆末端世界坐标（rotX=-π/2: local Y → world Z）
  const fwdRodTipLocalY = rodTipLocalY(fBodyL, fStroke, fPos);
  const fwdRodTipWorldZ = fwdWorldZ + fwdRodTipLocalY;
  const fwdRodTipWorldY = fwdWorldY;

  // --- 连接板 1（前后推杆末端 → 升降气缸缸体顶部）---
  const plate1Y = fwdRodTipWorldY;
  const plate1Z = fwdRodTipWorldZ;

  // --- 升降气缸 ---
  // 缸体竖直朝下，rotX=π: local Y → world -Y
  // 缸体上端（local -half → world +half）对齐连接板
  const lHalf = lBodyL / 2;
  const liftWorldY = plate1Y - lHalf - plateThick / 2 - STRUCT.PLATE_GAP;
  const liftWorldZ = plate1Z;

  // 升降推杆末端世界坐标（rotX=π: local Y → world -Y）
  const liftRodTipLocalY = rodTipLocalY(lBodyL, lStroke, lPos);
  const liftRodTipWorldY = liftWorldY - liftRodTipLocalY;
  const liftRodTipWorldZ = liftWorldZ;

  // --- 连接板 2（升降推杆末端 → 夹爪）---
  const plate2Y = liftRodTipWorldY;
  const plate2Z = liftRodTipWorldZ;

  // --- 夹爪 ---
  const gripperY = plate2Y - plateThick / 2 - STRUCT.PLATE_GAP;
  const gripperZ = plate2Z;

  // 自动拾取/释放判定
  const clampClosed = cPos < 0.15;     // 夹紧状态（openPosition ≈ 0）
  const clampOpen   = cPos > 0.25;     // 张开状态（指垫脱离工件≈0.19，+余量）

  // 指垫中心在夹爪局部空间的 Y 偏移（本体顶→本体底→滑块→爪→垫中）
  const padCenterOffset = -(
    COMPONENT.GRIPPER_BODY_SIZE[1] / 2 +
    COMPONENT.GRIPPER_SLIDER_H +
    COMPONENT.GRIPPER_JAW_H +
    COMPONENT.GRIPPER_PAD_H / 2
  );
  const padCenterWorldY = gripperY + padCenterOffset;
  const workCenterY = COMPONENT.WORKPIECE_SIZE[1] / 2;
  const proximityY = Math.abs(padCenterWorldY - workCenterY);
  const proximityZ = workpiece.held ? 0 : Math.abs(gripperZ - workpiece.pos[2]);

  // 工件实际世界坐标
  const workWorldY = workpiece.held ? gripperY + workpiece.offsetY : workpiece.pos[1];
  const workWorldZ = workpiece.held ? gripperZ : workpiece.pos[2];
  const workWorldX = workpiece.held ? 0 : workpiece.pos[0];

  // 夹紧 + 指垫贴近工件中心（Y+Z都要接近）→ 拾取
  useEffect(() => {
    if (!workpiece.held && clampClosed && proximityY < 0.03 && proximityZ < 0.06) {
      pickUpWorkpiece(padCenterOffset);
    }
  }, [clampClosed, proximityY, proximityZ, workpiece.held, padCenterOffset, pickUpWorkpiece]);

  // 张开 → 释放（记录当前完整世界坐标 [X, Y, Z]）
  useEffect(() => {
    if (workpiece.held && clampOpen) {
      releaseWorkpiece([0, padCenterWorldY, gripperZ]);
    }
  }, [clampOpen, workpiece.held, padCenterWorldY, gripperZ, releaseWorkpiece]);

  return (
    <group>
      <RobotFrame indicators={indicators} />

      {/* 前后气缸连接支座 — 从悬臂底部到缸体后端 */}
      <mesh
        position={[0, (cantBottomY + fwdWorldY) / 2, fwdRearZ - 0.01]}
        material={matPlate} castShadow
      >
        <boxGeometry args={[
          fBodyR * 1.5,
          cantBottomY - fwdWorldY,
          STRUCT.END_CAP_THICKNESS * 2,
        ]} />
      </mesh>

      {/* ===== Level 1: 前后气缸 — 缸体固定，推杆向前(+Z)伸出 ===== */}
      <group position={[0, fwdWorldY, fwdWorldZ]} rotation={[Math.PI / 2, 0, 0]}>
        <CylinderUnit
          bodyRadius={fBodyR} bodyLength={fBodyL} strokeLength={fStroke}
          rodRadius={COMPONENT.FORWARD_CYLINDER_ROD_RADIUS}
          position={fPos} extended={fExt} label="forward"
        />
      </group>

      {/* 连接板 1 */}
      <MountPlate x={0} y={plate1Y} z={plate1Z} />

      {/* ===== Level 2: 升降气缸 — 竖直朝下，沿 Y 轴 ===== */}
      <group position={[0, liftWorldY, liftWorldZ]} rotation={[Math.PI, 0, 0]}>
        <CylinderUnit
          bodyRadius={lBodyR} bodyLength={lBodyL} strokeLength={lStroke}
          rodRadius={COMPONENT.LIFT_CYLINDER_ROD_RADIUS}
          position={lPos} extended={lExt} label="lift"
        />
      </group>

      {/* 连接板 2 */}
      <MountPlate x={0} y={plate2Y} z={plate2Z} />

      {/* ===== Level 3: 平行夹爪 ===== */}
      <group position={[0, gripperY, gripperZ]}>
        <ParallelGripper openPosition={cPos} />
      </group>

      {/* ===== 物料工件 ===== */}
      {workpiece.exists && (
        <mesh
          position={[workWorldX, workWorldY, workWorldZ]}
          material={matWorkpiece}
          castShadow
          receiveShadow
        >
          <boxGeometry args={COMPONENT.WORKPIECE_SIZE} />
        </mesh>
      )}
    </group>
  );
}