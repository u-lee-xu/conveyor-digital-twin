/**
 * 变频器驱动台：第 7 个部件展台的裸视图组件。
 *
 * 教学演示装置，不参与分拣业务：柜体（LED 频率牌 + 运行/故障/通讯三灯）、
 * 三相电机（散热环、外露风扇、联轴器）、短皮带与双滚筒。
 *
 * 驱动口径（用户 2026-11-11 定稿）：动画只认
 * `useVfdStore.getState().outputFactor()` = 输出频率 / 50Hz，**不受
 * conveyorRunning 门控**；整机启停真值仍归 useDeviceStore / CONVEYOR 线圈，
 * 整机带速仍走带 engaged 保底的 speedFactor()。观众端不挂 VfdLink，
 * outputHz 由 exportSnapshot/applyBroadcast 每 100ms 镜像，本组件同样跟随。
 *
 * 纯视觉装置，不挂 RigidBody / Collider：展台关闭地面，也不参与物理分拣闭环。
 * 可见尺寸全部派生自 VFD_DRIVE_DETAIL，几何走共享单例，颜色走 VISUAL。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { isViewerRuntime } from '@digital-twin/shared';
import { geometries, materials } from '../../../components/scene/shared';
import { SURFACE_GAP, VFD_DRIVE_DETAIL as V } from '../constants';
import { useVfdStore } from '../../../stores/useVfdStore';

/** 柜门三只状态灯的亮态材质：运行绿 / 故障红 / 通讯蓝 */
const LED_ON = [materials.vfdLedRun, materials.vfdLedFault, materials.vfdLedComm] as const;

/**
 * 与 ConveyorDeviceEffects 的 __DEBUG__ 同款：生产构建默认不暴露，
 * CDP 验收用 ?debug=1 显式打开，只读镜像动画状态，不写 store / 不碰 PLC。
 */
const DEBUG_ENABLED = typeof window !== 'undefined'
  && (import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug'));

interface DriveDebug {
  hz: number;
  factor: number;
  fanAngle: number;
  beltPhase: number;
  leds: boolean[];
  role: 'teacher' | 'viewer';
}

/** LED 频率牌：CanvasTexture 动态重绘，避免引入额外字体/文本依赖 */
function drawDisplay(ctx: CanvasRenderingContext2D | null, hz: number) {
  if (!ctx) return;
  const w = 512;
  const h = 220;
  ctx.fillStyle = '#0d1620';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a3b4c';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff6b45';
  ctx.font = 'bold 104px Consolas, "Courier New", monospace';
  ctx.fillText(hz.toFixed(2), 22, 80);
  ctx.font = 'bold 42px Consolas, "Courier New", monospace';
  ctx.fillText('Hz', 380, 90);
  ctx.fillStyle = '#7f97ad';
  ctx.font = 'bold 32px Consolas, "Courier New", monospace';
  // 4 极电机同步转速：50Hz → 1500rpm
  ctx.fillText(`${Math.round(hz * V.RPM_PER_HZ)} rpm`, 24, 176);
}

export function PhysicsVfdDrive() {
  const fanRef = useRef<THREE.Group>(null);
  const rollerRefs = useRef<(THREE.Group | null)[]>([]);
  const stripeRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ledRefs = useRef<(THREE.Mesh | null)[]>([]);
  const beltPhase = useRef(0);
  const lastHz = useRef(Number.NaN);

  // useMemo 只暴露 texture 与一个更新函数，避免 hook 返回值被外部直接改属性
  const { texture: displayTexture, updateDisplay } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    return {
      texture,
      updateDisplay: (hz: number) => {
        drawDisplay(ctx, hz);
        texture.needsUpdate = true;
      },
    };
  }, []);

  useFrame((_, delta) => {
    const s = useVfdStore.getState();
    const factor = s.outputFactor();
    const dt = Math.min(delta, 0.05);

    // 电机风扇 / 轴 / 双滚筒：同一个角速度，50Hz 对应 MAX_RPS 转/秒
    const angle = factor * V.MAX_RPS * Math.PI * 2 * dt;
    if (fanRef.current) fanRef.current.rotation.z -= angle;
    rollerRefs.current.forEach((r) => { if (r) r.rotation.z -= angle; });

    // 皮带条纹沿 +X 循环平移，速度与输出频率成正比
    beltPhase.current += factor * V.BELT_SPEED * dt;
    stripeRefs.current.forEach((m, i) => {
      if (!m) return;
      const span = V.BELT_LEN;
      const t = ((i / V.STRIPE_COUNT) * span + beltPhase.current) % span;
      m.position.x = V.BELT_CENTER_X - span / 2 + t;
    });

    // 频率数字牌：变化超过 0.01Hz 才重绘，避免每帧刷 CanvasTexture
    const hz = Math.round(s.outputHz * 100) / 100;
    if (Number.isNaN(lastHz.current) || Math.abs(hz - lastHz.current) > 0.004) {
      updateDisplay(hz);
      lastHz.current = hz;
    }

    // 状态灯：运行取「有输出且无故障」，故障红优先，通讯蓝只看在线标志
    const states = [s.outputHz > 0.01 && !s.faultCode, !!s.faultCode, s.commOnline];
    ledRefs.current.forEach((m, i) => {
      if (!m) return;
      m.material = states[i] ? LED_ON[i] : materials.vfdLedOff;
    });

    if (DEBUG_ENABLED) {
      (window as unknown as { __dtVfdDrive?: DriveDebug }).__dtVfdDrive = {
        hz, factor,
        fanAngle: fanRef.current?.rotation.z ?? 0,
        beltPhase: beltPhase.current,
        leds: states,
        role: isViewerRuntime() ? 'viewer' : 'teacher',
      };
    }
  });

  const faceZ = -V.CABINET_D / 2 - V.DOOR_T;
  const decalZ = faceZ - SURFACE_GAP;
  const rollerXs = [V.BELT_CENTER_X - V.ROLLER_DX, V.BELT_CENTER_X + V.ROLLER_DX];
  const beltY = V.BELT_Y + V.ROLLER_R;
  const motorFront = V.MOTOR_LEN / 2;

  return (
    <group>
      {/* 展台底座 */}
      <mesh geometry={geometries.vfdBase} material={materials.base}
        position={[0, V.BASE_Y, V.BASE_Z]} />

      {/* ===== 变频器柜体：面板朝 -Z，与整机默认 -Z 机位一致 ===== */}
      <group position={[V.CABINET_X, 0, V.CABINET_Z]}>
        <mesh geometry={geometries.vfdCabinet} material={materials.vfdCabinet}
          position={[0, V.CABINET_H / 2, 0]} />
        <mesh geometry={geometries.vfdDoor} material={materials.vfdDoor}
          position={[0, V.CABINET_H / 2, faceZ + V.DOOR_T / 2]} />

        {/* LED 频率牌：PlaneGeometry 默认法向 +Z，转 180° 面向 -Z */}
        <mesh geometry={geometries.vfdDisplay}
          position={[0, V.DISPLAY_Y, decalZ]}
          rotation={[0, Math.PI, 0]}>
          <meshBasicMaterial map={displayTexture} toneMapped={false} />
        </mesh>

        {/* 运行 / 故障 / 通讯三只状态灯 */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(el) => { ledRefs.current[i] = el; }}
            geometry={geometries.vfdLed} material={materials.vfdLedOff}
            position={[(i - 1) * V.LED_GAP, V.LED_Y, decalZ - V.LED_R * 0.4]} />
        ))}

        {/* 散热栅格与铭牌 */}
        {Array.from({ length: V.VENT_COUNT }, (_, i) => (
          <mesh key={i} geometry={geometries.vfdVent} material={materials.profileSlot}
            position={[0, 0.22 - i * V.VENT_GAP, decalZ]} />
        ))}
        <mesh geometry={geometries.vfdNameplate} material={materials.vfdNameplate}
          position={[0, V.NAMEPLATE_Y, decalZ]} />
      </group>

      {/* ===== 三相电机：轴线沿 Z，与左滚筒同轴 ===== */}
      <group position={[V.MOTOR_X, V.MOTOR_Y, V.MOTOR_Z]}>
        <mesh geometry={geometries.vfdMotorBody} material={materials.vfdMotor}
          rotation={[Math.PI / 2, 0, 0]} />
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={geometries.vfdMotorEndcap} material={materials.endCap}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, side * motorFront]} />
        ))}

        {/* 环形散热筋：Torus 法向 Z，沿电机长度均匀排布 */}
        {Array.from({ length: V.FIN_COUNT }, (_, i) => (
          <mesh key={i} geometry={geometries.vfdMotorFinRing} material={materials.vfdMotorFin}
            position={[0, 0, -V.FIN_LEN / 2 + (i * V.FIN_LEN) / (V.FIN_COUNT - 1)]} />
        ))}

        {/* 接线盒、地脚立柱 */}
        <mesh geometry={geometries.vfdMotorJunction} material={materials.vfdCabinet}
          position={[0, V.MOTOR_R + 0.026, 0]} />
        {[-1, 1].map((side) => (
          <mesh key={side} geometry={geometries.vfdMotorStand} material={materials.base}
            position={[0, -V.MOTOR_R - 0.095, side * V.MOTOR_LEN * 0.3]} />
        ))}

        {/* 输出轴与联轴器 */}
        <mesh geometry={geometries.vfdShaft} material={materials.brightSilver}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, motorFront + V.SHAFT_LEN / 2 - 0.02]} />
        <mesh geometry={geometries.vfdCoupling} material={materials.axle}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, V.COUPLING_Z - V.MOTOR_Z]} />

        {/* 尾端外露风扇：整组绕 Z 轴自转 */}
        <group ref={fanRef} position={[0, 0, -motorFront - 0.02]}>
          <mesh geometry={geometries.vfdFanHub} material={materials.brightSilver}
            rotation={[Math.PI / 2, 0, 0]} />
          {Array.from({ length: V.FAN_BLADE_COUNT }, (_, i) => {
            const a = (i / V.FAN_BLADE_COUNT) * Math.PI * 2;
            return (
              <mesh key={i} geometry={geometries.vfdFanBlade} material={materials.vfdFanBlade}
                position={[Math.cos(a) * V.FAN_R * 0.55, Math.sin(a) * V.FAN_R * 0.55, 0]}
                rotation={[0, 0, a + Math.PI / 6]} />
            );
          })}
        </group>
        <mesh geometry={geometries.vfdFanRing} material={materials.endCap}
          position={[0, 0, -motorFront - 0.02]} />
      </group>

      {/* ===== 短皮带与双滚筒 ===== */}
      {rollerXs.map((x, i) => (
        <group key={i} ref={(el) => { rollerRefs.current[i] = el; }}
          position={[x, V.BELT_Y, 0]}>
          <mesh geometry={geometries.vfdRoller} material={materials.vfdRoller}
            rotation={[Math.PI / 2, 0, 0]} />
          {[-1, 1].map((side) => (
            <mesh key={side} geometry={geometries.vfdRollerEnd} material={materials.vfdRollerFace}
              rotation={[Math.PI / 2, 0, 0]}
              position={[0, 0, side * V.ROLLER_LEN / 2]} />
          ))}
        </group>
      ))}

      <mesh geometry={geometries.vfdBelt} material={materials.vfdBelt}
        position={[V.BELT_CENTER_X, beltY + V.BELT_T / 2, 0]} />
      {Array.from({ length: V.STRIPE_COUNT }, (_, i) => (
        <mesh key={i} ref={(el) => { stripeRefs.current[i] = el; }}
          geometry={geometries.vfdStripe} material={materials.vfdStripe}
          position={[
            V.BELT_CENTER_X - V.BELT_LEN / 2 + (i / V.STRIPE_COUNT) * V.BELT_LEN,
            beltY + V.BELT_T + V.STRIPE_T / 2, 0,
          ]} />
      ))}

      {/* 四根支腿托住滚筒轴 */}
      {rollerXs.flatMap((x) => [-1, 1].map((side) => (
        <mesh key={`${x}-${side}`} geometry={geometries.vfdStand} material={materials.base}
          position={[x, V.STAND_H / 2, side * (V.BELT_W / 2 - 0.02)]} />
      )))}
    </group>
  );
}
